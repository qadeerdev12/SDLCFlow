import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';
import User from '../../src/models/User.js';
import Board from '../../src/models/Board.js';
import Workflow from '../../src/models/Workflow.js';
import List from '../../src/models/List.js';
import Message from '../../src/models/Message.js';

async function until(check, description) {
  const deadline = Date.now() + 20000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}`);
    await delay(50);
  }
}

// Change only timing claims on a real persisted session. This helper is confined
// to the browser runner; production issuance and verification remain unchanged.
function withLifetime(token, seconds) {
  const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ ...claims, iat: now - 60, exp: now + seconds }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

export async function checkRenewal({ newPage, origin, apiOrigin, io, password }) {
  async function login(page) {
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill('browser@example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: /projects$/ }).waitFor();
  }

  const page = await newPage();
  try {
    await login(page);
    await page.goto(`${origin}/profile`);
    await until(async () => (await page.getByLabel('Name', { exact: true }).inputValue()) === 'Browser Tester', 'profile loaded');
    let rotations = 0;
    page.on('request', (req) => { if (req.url().endsWith('/auth/refresh')) rotations++; });
    const statuses = [];
    let mode = 'expire-once';
    await page.route('**/api/v1/auth/profile', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      if (mode === 'outage') {
        statuses.push(503);
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Simulated profile outage' } }) });
      }
      const headers = { ...route.request().headers() };
      if (mode === 'always-expired' || statuses.length === 0) {
        headers.authorization = `Bearer ${withLifetime(headers.authorization.slice(7), -1)}`;
      }
      // Ask the real server to reject the expired token before its controller.
      const response = await route.fetch({ headers });
      statuses.push(response.status());
      if (response.status() === 401) assert.equal((await response.json()).error.code, 'SESSION_EXPIRED');
      await route.fulfill({ response });
    });
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Renewed Tester');
    await page.getByRole('button', { name: 'Save details' }).click();
    await page.getByText('Profile updated.', { exact: true }).waitFor();
    assert.deepEqual(statuses, [401, 200]);
    assert.equal(rotations, 1);
    assert.equal((await User.findOne({ email: 'browser@example.test' })).name, 'Renewed Tester');
    console.log('PASS REST expiry refreshes once and retries the rejected mutation successfully');

    mode = 'outage';
    statuses.length = 0;
    rotations = 0;
    await name.fill('Unsaved profile draft');
    await page.getByRole('button', { name: 'Save details' }).click();
    await page.getByText('Simulated profile outage', { exact: true }).first().waitFor();
    assert.deepEqual(statuses, [503]);
    assert.equal(rotations, 0);
    assert.equal(await name.inputValue(), 'Unsaved profile draft');
    assert.equal((await User.findOne({ email: 'browser@example.test' })).name, 'Renewed Tester');
    console.log('PASS REST outage does not renew or replay; unsaved profile draft survives');

    mode = 'always-expired';
    statuses.length = 0;
    await page.getByRole('button', { name: 'Save details' }).click();
    await page.getByRole('heading', { name: 'Log in to SDLCFlow' }).waitFor();
    assert.deepEqual(statuses, [401, 401], 'Even repeated expiry must stop after one retry');
    assert.equal(rotations, 1);
    assert.equal((await User.findOne({ email: 'browser@example.test' })).name, 'Renewed Tester');
    console.log('PASS second REST expiry stops retrying and clears the session');
  } finally {
    await page.context().close();
  }

  const owner = await User.findOne({ email: 'browser@example.test' });
  const board = await Board.create({ name: 'Renewal verification', owner: owner._id, members: [{ user: owner._id, role: 'owner' }] });
  const workflow = await Workflow.create({ board: board._id, name: 'Browser workflow', position: 1 });
  const list = await List.create({ board: board._id, workflow: workflow._id, title: 'Before renewal', position: 1 });
  const realtime = await newPage();
  const sockets = [];
  const invalidations = [];
  let rejectNextMessage = false;
  let messageAttempts = 0;
  const observeConnection = (socket) => {
    if (socket.data.user.id !== owner.id) return;
    sockets.push(socket);
    socket.prependAny((event) => {
      if (event !== 'message:create') return;
      messageAttempts++;
      if (rejectNextMessage) {
        rejectNextMessage = false;
        // Socket.IO catch-all listeners run before packet middleware. Move this
        // test session's deadline past now so the real guard rejects this packet
        // before the message handler, without racing the idle expiry timer.
        socket.data.session.expiresAt = Date.now() - 1;
      }
    });
    socket.onAnyOutgoing((event, payload) => {
      if (event === 'session:invalidated') invalidations.push({ id: socket.id, code: payload.code });
    });
  };
  io.on('connection', observeConnection);
  let releaseRefresh;
  const heldRefresh = new Promise((resolve) => { releaseRefresh = resolve; });
  try {
    // The browser receives a genuinely signed short-lived access token. The
    // cookie is unchanged, and the real server's expiry timer initiates renewal.
    await realtime.route('**/api/v1/auth/login', async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      const body = await response.json();
      body.data.token = withLifetime(body.data.token, 12);
      body.data.expiresAt = new Date(jwt.decode(body.data.token).exp * 1000).toISOString();
      await route.fulfill({ response, json: body });
    });
    await login(realtime);
    let rotations = 0;
    await realtime.route('**/api/v1/auth/refresh', async (route) => {
      rotations++;
      await heldRefresh;
      await route.continue();
    });
    await realtime.getByRole('button', { name: 'Open Renewal verification', exact: true }).first().click();
    await realtime.getByText('Before renewal', { exact: true }).waitFor();
    await until(() => sockets.some((socket) => socket.rooms.has(`board:${board.id}`)), 'initial board join');
    await realtime.getByRole('button', { name: 'Chat', exact: true }).click();
    const draft = realtime.getByPlaceholder('Message this project');
    await draft.fill('Draft retained through token renewal');
    const beforeIds = sockets.map((socket) => socket.id);
    await until(() => rotations > 0, 'server expiry triggers refresh');
    assert.ok(invalidations.some((entry) => beforeIds.includes(entry.id) && entry.code === 'SESSION_EXPIRED'));
    assert.equal(await draft.inputValue(), 'Draft retained through token renewal');
    // Deliberately omit a broadcast. Reconnection must fetch the missed state.
    await List.updateOne({ _id: list._id }, { title: 'Changed while disconnected' });
    releaseRefresh();
    await realtime.getByText('Changed while disconnected', { exact: true }).waitFor();
    await until(() => sockets.some((socket) => !beforeIds.includes(socket.id) && socket.rooms.has(`board:${board.id}`)), 'replacement socket rejoins board');
    assert.equal(rotations, 1, 'Board and inbox sockets must share one refresh');
    assert.ok(sockets.filter((socket) => beforeIds.includes(socket.id)).every((socket) => !socket.connected));
    assert.equal(await draft.inputValue(), 'Draft retained through token renewal');
    assert.equal(await Message.countDocuments({ board: board._id }), 0, 'Renewal must not submit a draft');
    console.log('PASS socket expiry shares one renewal, replaces sockets, rejoins room and refetches missed state');
    await realtime.getByRole('button', { name: 'Send message', exact: true }).click();
    await until(() => Message.countDocuments({ board: board._id, body: 'Draft retained through token renewal' }).then((count) => count === 1), 'explicit send persists once');
    await until(async () => await draft.inputValue() === '', 'successful send clears draft');
    assert.equal(await Message.countDocuments({ board: board._id }), 1);
    console.log('PASS chat draft survives renewal and sends once after explicit user action');

    const connectedIds = sockets.map((socket) => socket.id);
    const activeBoardSocket = sockets.find((socket) => socket.rooms.has(`board:${board.id}`));
    // JWT timestamps have one-second precision. Our synthetic packet deadline
    // must not renew in its issuance second and accidentally mint the same JWT.
    await until(() => Math.floor(Date.now() / 1000) > jwt.decode(activeBoardSocket.handshake.auth.token).iat, 'next JWT issuance second');
    rejectNextMessage = true;
    await draft.fill('Message rejected at expiry');
    await realtime.getByRole('button', { name: 'Send message', exact: true }).click();
    await until(() => sockets.some((socket) => !connectedIds.includes(socket.id) && socket.rooms.has(`board:${board.id}`)), 'packet expiry reconnects');
    const retry = realtime.getByRole('button', { name: 'Retry', exact: true });
    await retry.waitFor();
    assert.equal(messageAttempts, 2, 'The rejected socket mutation must not replay automatically');
    assert.equal(await Message.countDocuments({ board: board._id }), 1);
    assert.equal(rotations, 2);
    await retry.click();
    await until(() => Message.countDocuments({ board: board._id, body: 'Message rejected at expiry' }).then((count) => count === 1), 'manual retry persists once');
    await retry.waitFor({ state: 'detached' });
    assert.equal(messageAttempts, 3);
    assert.equal(await Message.countDocuments({ board: board._id }), 2);
    console.log('PASS expired socket mutation is not replayed; failed message survives and manual retry sends once');
  } finally {
    releaseRefresh();
    io.off('connection', observeConnection);
    await realtime.context().close();
  }
}
