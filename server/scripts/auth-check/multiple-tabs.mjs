import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import User from '../../src/models/User.js';
import RefreshSession from '../../src/models/RefreshSession.js';

const LOCK = 'sdlcflow:cookie-auth:v1';
const REVISION = 'sdlcflow:auth-revision:v1';

async function until(check, description) {
  const deadline = Date.now() + 15000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}`);
    await delay(50);
  }
}

export async function checkMultipleTabs({ newPage, origin, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const owner = await User.create({ name: 'Multitab Owner', email: 'tabs-owner@example.test', passwordHash });
  const other = await User.create({ name: 'Alternate User', email: 'tabs-other@example.test', passwordHash });
  const first = await newPage();
  const context = first.context();
  let release = () => {};
  try {
    // Observe only the app's channel. Assertions below require fixed metadata
    // fields, never credentials or account data. Nothing is printed or persisted.
    await context.addInitScript(() => {
      window.authBroadcasts = [];
      const send = BroadcastChannel.prototype.postMessage;
      BroadcastChannel.prototype.postMessage = function (message) {
        if (this.name === 'sdlcflow:auth-events:v1') window.authBroadcasts.push(structuredClone(message));
        return send.call(this, message);
      };
    });
    async function login(page, email, name) {
      await page.goto(`${origin}/login`);
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await page.getByRole('heading', { name: `${name}'s projects`, exact: true }).waitFor();
    }
    const ownerDashboard = (page) => page.getByRole('heading', { name: "Multitab's projects", exact: true });
    await login(first, owner.email, 'Multitab');
    const second = await newPage(context);
    await second.goto(`${origin}/dashboard`);
    await ownerDashboard(second).waitFor();
    const family = await RefreshSession.findOne({ user: owner._id });
    assert.ok(family);

    // Hold one real refresh before sending it. The second tab must be waiting
    // in the browser's Web Lock queue, not making a concurrent cookie request.
    let refreshes = 0;
    let held = new Promise((resolve) => { release = resolve; });
    const serialRefresh = async (route) => {
      refreshes++;
      if (refreshes === 1) await held;
      await route.continue();
    };
    await context.route('**/api/v1/auth/refresh', serialRefresh);
    // A held auth request can delay page load. Navigation commit plus the lock
    // queue is the meaningful synchronization point for this concurrency test.
    await first.reload({ waitUntil: 'commit' });
    await until(() => refreshes === 1, 'first tab starts refresh');
    await second.reload({ waitUntil: 'commit' });
    await second.waitForFunction(async (name) => {
      const locks = await navigator.locks.query();
      return locks.held.some((lock) => lock.name === name) && locks.pending.some((lock) => lock.name === name);
    }, LOCK);
    assert.equal(refreshes, 1);
    release();
    await ownerDashboard(first).waitFor();
    await ownerDashboard(second).waitFor();
    assert.equal(refreshes, 2, 'Each tab restores its own memory token, serially');
    const rotated = await RefreshSession.findById(family._id);
    assert.equal(rotated.rotationCount, family.rotationCount + 2);
    assert.equal(rotated.revokedAt, null, 'Concurrent tab restoration must not trigger replay revocation');
    await context.unroute('**/api/v1/auth/refresh', serialRefresh);
    console.log('PASS two tabs serialize refreshes through Web Locks without cookie replay');

    await first.goto(`${origin}/profile`);
    const name = first.getByLabel('Name', { exact: true });
    await until(async () => await name.inputValue() === owner.name, 'first account profile loaded');
    await name.fill('Private unsaved draft');
    let firstRefreshes = 0;
    first.on('request', (request) => { if (request.url().endsWith('/auth/refresh')) firstRefreshes++; });
    await login(second, other.email, 'Alternate');
    await first.getByRole('alert').filter({ hasText: 'Your session changed in another tab' }).waitFor();
    assert.equal(await name.count(), 0, 'Old profile form must unmount on account change');
    assert.equal(await first.getByRole('heading', { name: 'Profile', exact: true }).count(), 0);
    assert.equal(firstRefreshes, 0, 'Account changes require explicit adoption, not automatic cross-tab renewal');
    await first.getByRole('button', { name: 'Try again', exact: true }).click();
    await until(async () => await name.inputValue() === other.name, 'explicit retry adopts new account');
    assert.equal(firstRefreshes, 1);
    assert.equal(await first.getByLabel('Email', { exact: true }).inputValue(), other.email);
    const messages = await second.evaluate(() => window.authBroadcasts);
    assert.ok(messages.some((message) => message.type === 'session-changed'));
    for (const message of messages) {
      assert.deepEqual(Object.keys(message).sort(), ['revision', 'type']);
      assert.ok(['session-changed', 'recovery-required'].includes(message.type));
      assert.match(message.revision, /^[0-9a-f-]{36}$/);
    }
    console.log('PASS account switch clears the other tab and its draft; explicit retry adopts the new identity');
    console.log('PASS cross-tab broadcasts contain only event type and opaque revision');

    // Simulate the dangerous case: the server commits rotation but the browser
    // loses the reply. The waiting tab must not rotate again to guess the outcome.
    const alternateFamily = await RefreshSession.findOne({ user: other._id });
    refreshes = 0;
    held = new Promise((resolve) => { release = resolve; });
    await context.route('**/api/v1/auth/refresh', async (route) => {
      refreshes++;
      if (refreshes === 1) {
        await held;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('failed');
      } else await route.continue();
    });
    await first.reload({ waitUntil: 'commit' });
    await until(() => refreshes === 1, 'held refresh starts');
    await second.reload({ waitUntil: 'commit' });
    await second.waitForFunction(async (lockName) => (await navigator.locks.query()).pending.some((lock) => lock.name === lockName), LOCK);
    release();
    for (const tab of [first, second]) {
      await tab.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
      assert.equal(await tab.getByRole('heading', { name: /^(Profile|Alternate's projects)$/ }).count(), 0);
    }
    assert.equal(refreshes, 1);
    const afterLoss = await RefreshSession.findById(alternateFamily._id);
    assert.equal(afterLoss.rotationCount, alternateFamily.rotationCount + 1);
    assert.equal(afterLoss.revokedAt, null);
    const state = await first.evaluate((key) => JSON.parse(localStorage.getItem(key)), REVISION);
    assert.deepEqual(Object.keys(state).sort(), ['blocked', 'revision']);
    assert.equal(state.blocked, true);
    // The stop marker must survive a reload, not just a transient channel event.
    await first.reload();
    await second.reload();
    await first.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
    await second.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(refreshes, 1);
    console.log('PASS lost refresh response blocks the queued tab and both reloads without replay');
  } finally {
    release();
    await context.close();
  }
}
