import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import User from '../../src/models/User.js';
import RefreshSession from '../../src/models/RefreshSession.js';
import Board from '../../src/models/Board.js';

async function until(check, description) {
  const deadline = Date.now() + 15000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}`);
    await delay(50);
  }
}

export async function checkAccountActions({ newPage, origin, apiOrigin, io, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const replacement = 'Replacement browser passphrase 2026!';
  const collaborator = await User.create({ name: 'Remaining Member', email: 'remaining@example.test', passwordHash });

  // Probes use credentials captured only in runner memory. A UI redirect alone
  // cannot prove revocation: the server must reject old REST and socket access.
  async function probe(token, status) {
    const response = await fetch(`${apiOrigin}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, status);
  }
  async function rejectSocket(token) {
    const socket = connect(apiOrigin, { auth: { token }, autoConnect: false, reconnection: false });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Old socket handshake did not finish')), 10000);
        socket.once('connect', () => { clearTimeout(timer); reject(new Error('Revoked credential connected')); });
        socket.once('connect_error', (error) => {
          clearTimeout(timer);
          if (['SESSION_INVALIDATED', 'USER_NOT_FOUND'].includes(error.data?.code)) resolve();
          else reject(new Error(`Unexpected rejection code: ${error.data?.code}`));
        });
        socket.connect();
      });
    } finally { socket.disconnect(); }
  }
  async function rejectRefresh(cookie) {
    const response = await fetch(`${apiOrigin}/api/v1/auth/refresh`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json',
        'X-SDLCFlow-CSRF': '1', Cookie: `${cookie.name}=${cookie.value}` }, body: '{}',
    });
    assert.equal(response.status, 401);
  }
  const actionResponse = (page, path, method) => page.waitForResponse((response) =>
    response.url() === `${apiOrigin}/api/v1/auth/${path}` && response.request().method() === method);
  async function login(page, user, secret = password) {
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(secret);
    const response = actionResponse(page, 'login', 'POST');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const result = await response;
    assert.equal(result.status(), 200);
    const token = (await result.json()).data.token;
    await page.getByRole('heading', { name: /projects$/ }).waitFor();
    return token;
  }

  for (const action of ['logout', 'logout-all', 'password', 'delete']) {
    const user = await User.create({ name: 'Account Tester', email: `account-${action}@example.test`, passwordHash });
    const first = await newPage();
    const other = await newPage(); // Another device/session, not a shared cookie jar.
    const sockets = [];
    const observe = (socket) => { if (socket.data.user.id === user.id) sockets.push(socket); };
    io.on('connection', observe);
    try {
      const firstToken = await login(first, user);
      const otherToken = await login(other, user);
      const firstFamily = jwt.decode(firstToken).sid;
      const otherFamily = jwt.decode(otherToken).sid;
      assert.notEqual(firstFamily, otherFamily);
      await first.goto(`${origin}/profile`);
      await until(async () => await first.getByLabel('Name', { exact: true }).inputValue() === user.name, 'profile loaded');
      let sharedTab;
      if (action === 'logout') {
        sharedTab = await newPage(first.context());
        await sharedTab.goto(`${origin}/dashboard`);
        await sharedTab.getByRole('heading', { name: "Account's projects", exact: true }).waitFor();
      }
      await until(() => [firstFamily, otherFamily].every((family) => sockets.some((socket) => socket.connected && socket.data.session.familyId === family)), 'both independent sessions connected');
      const activeSockets = sockets.filter((socket) => socket.connected);
      const firstCookie = (await first.context().cookies(apiOrigin)).find((cookie) => cookie.name === 'sdlcflow_refresh_dev');
      const otherCookie = (await other.context().cookies(apiOrigin)).find((cookie) => cookie.name === 'sdlcflow_refresh_dev');
      assert.ok(firstCookie && otherCookie);
      const path = action === 'delete' ? 'me' : action;
      const method = action === 'delete' ? 'DELETE' : action === 'password' ? 'PATCH' : 'POST';
      let requests = 0;
      first.on('request', (request) => {
        if (request.url() === `${apiOrigin}/api/v1/auth/${path}` && request.method() === method) requests++;
      });
      let owned, shared;
      if (action === 'delete') {
        owned = await Board.create({ name: 'Owned deletion fixture', owner: user._id, members: [{ user: user._id, role: 'owner' }] });
        shared = await Board.create({ name: 'Preserved shared fixture', owner: collaborator._id,
          members: [{ user: collaborator._id, role: 'owner' }, { user: user._id, role: 'member' }] });
        await first.getByLabel('Confirm email', { exact: true }).fill(user.email);
        await first.getByLabel('Password', { exact: true }).fill(password);
      }
      if (action === 'logout-all' || action === 'delete') {
        const open = first.getByRole('button', { name: action === 'delete' ? 'Delete' : 'Log out everywhere', exact: true });
        await open.click();
        await first.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(requests, 0, 'Cancelling confirmation must not call the server');
        await probe(firstToken, 200);
      }
      if (action === 'password' || action === 'delete') {
        if (action === 'password') {
          await first.getByLabel('Current password', { exact: true }).fill('wrong-password');
          await first.getByLabel('New password', { exact: true }).fill(replacement);
          await first.getByLabel('Confirm password', { exact: true }).fill(replacement);
        } else await first.getByLabel('Password', { exact: true }).fill('wrong-password');
        const failed = actionResponse(first, path, method);
        await first.getByRole('button', { name: action === 'password' ? 'Update password' : 'Delete', exact: true }).click();
        if (action === 'delete') await first.getByRole('alertdialog').getByRole('button', { name: 'Delete account', exact: true }).click();
        assert.equal((await failed).status(), 401);
        if (action === 'delete') await first.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
        await probe(firstToken, 200);
        await probe(otherToken, 200);
        assert.ok(activeSockets.every((socket) => socket.connected));
        assert.ok(await User.exists({ _id: user._id }));
        await first.getByLabel(action === 'password' ? 'Current password' : 'Password', { exact: true }).fill(password);
      }
      const success = actionResponse(first, path, method);
      if (action === 'logout') {
        await first.locator('button[aria-haspopup="menu"]').click();
        await first.getByRole('menuitem', { name: 'Log out', exact: true }).click();
      } else {
        await first.getByRole('button', { name: action === 'password' ? 'Update password' : action === 'delete' ? 'Delete' : 'Log out everywhere', exact: true }).click();
        if (action !== 'password') await first.getByRole('alertdialog').getByRole('button', { name: action === 'delete' ? 'Delete account' : 'Log out everywhere', exact: true }).click();
      }
      assert.equal((await success).status(), 200);
      await first.getByRole('heading', { name: action === 'delete' ? 'Create your account' : 'Log in to SDLCFlow', exact: true }).waitFor();
      assert.equal(requests, action === 'password' || action === 'delete' ? 2 : 1);
      assert.equal((await first.context().cookies(apiOrigin)).some((cookie) => cookie.name === 'sdlcflow_refresh_dev'), false);
      await probe(firstToken, 401);
      await rejectSocket(firstToken);
      await rejectRefresh(firstCookie);
      await until(() => activeSockets.filter((socket) => action !== 'logout' || socket.data.session.familyId === firstFamily).every((socket) => !socket.connected), 'affected live sockets revoked');
      if (action === 'logout') {
        await until(async () => await sharedTab.getByRole('heading', { name: "Account's projects", exact: true }).count() === 0, 'shared-cookie tab clears protected content');
        await probe(otherToken, 200);
        assert.ok(activeSockets.filter((socket) => socket.data.session.familyId === otherFamily).every((socket) => socket.connected));
        assert.equal((await RefreshSession.findById(firstFamily)).revocationReason, 'logout');
        assert.equal((await RefreshSession.findById(otherFamily)).revokedAt, null);
      } else {
        await other.getByRole('heading', { name: 'Log in to SDLCFlow', exact: true }).waitFor();
        await probe(otherToken, 401);
        await rejectSocket(otherToken);
        await rejectRefresh(otherCookie);
      }
      if (action === 'password') {
        await first.getByLabel('Email', { exact: true }).fill(user.email);
        await first.getByLabel('Password', { exact: true }).fill(password);
        const denied = actionResponse(first, 'login', 'POST');
        await first.getByRole('button', { name: 'Log in', exact: true }).click();
        assert.equal((await denied).status(), 401);
        await login(first, user, replacement);
      }
      if (action === 'logout-all') {
        const saved = await User.findById(user._id).select('+sessionVersion +passwordHash');
        assert.equal(saved.sessionVersion, 1);
        assert.equal(saved.passwordHash, passwordHash);
        await login(first, user);
      }
      if (action === 'delete') {
        assert.equal(await User.exists({ _id: user._id }), null);
        assert.equal(await RefreshSession.countDocuments({ user: user._id }), 0);
        assert.equal(await Board.exists({ _id: owned._id }), null);
        const remaining = await Board.findById(shared._id);
        assert.ok(remaining);
        assert.deepEqual(remaining.members.map((member) => member.user.toString()), [collaborator.id]);
      }
      console.log(`PASS ${action}: UI action, cookie cleanup, REST/socket revocation and correct session scope`);
    } finally {
      io.off('connection', observe);
      await first.context().close();
      await other.context().close();
    }
  }
}
