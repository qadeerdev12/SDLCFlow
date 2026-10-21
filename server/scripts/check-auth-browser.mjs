import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright';
import { Server } from 'socket.io';
import { createApp } from '../src/app.js';
import { configureSockets } from '../src/socket.js';
import User from '../src/models/User.js';
import { checkRenewal } from './auth-check/renewal.mjs';

// Never load server .env or connect to the user's database. Vite's API/socket
// URLs are overridden too, so the real client can only use these test servers.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-auth-browser-check-only';
const clientRoot = fileURLToPath(new URL('../../client/', import.meta.url));
const requireClient = createRequire(join(clientRoot, 'package.json'));
const { createServer } = await import(pathToFileURL(requireClient.resolve('vite')).href);
const scratch = await mkdtemp(join(tmpdir(), 'sdlcflow-auth-check-'));
const password = 'Browser-only test passphrase 2026!';
const problems = [];
let mongo, api, io, vite, browser;

try {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.create({ name: 'Browser Tester', email: 'browser@example.test', passwordHash: await bcrypt.hash(password, 10) });
  api = http.createServer();
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  vite = await createServer({
    root: clientRoot, configFile: join(clientRoot, 'vite.config.js'),
    envFile: false, cacheDir: join(scratch, 'vite-cache'),
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(`${apiOrigin}/api/v1`),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(apiOrigin),
    },
    server: { host: '127.0.0.1', port: 0, open: false },
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.CLIENT_ORIGIN = origin;
  const app = createApp();
  api.on('request', app);
  io = new Server(api, { cors: { origin, methods: ['GET', 'POST'] } });
  app.set('io', io);
  configureSockets(io);
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });

  async function newPage() {
    const context = await browser.newContext();
    await context.route('**/*', (route) => {
      if ([origin, apiOrigin].includes(new URL(route.request().url()).origin)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => problems.push(error.message));
    return page;
  }
  const dashboard = (page, name = 'Browser') => page.getByRole('heading', { name: `${name}'s projects`, exact: true });
  const authResponse = (page, action) => page.waitForResponse((res) => res.url() === `${apiOrigin}/api/v1/auth/${action}` && res.request().method() === 'POST');
  async function checkSecrets(page, token) {
    const cookies = await page.context().cookies(apiOrigin);
    const cookie = cookies.find((entry) => entry.name === 'sdlcflow_refresh_dev');
    assert.ok(cookie, 'Refresh cookie must be stored by the browser');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(cookie.secure, false, 'Only this loopback HTTP test uses a non-Secure cookie');
    assert.equal(cookie.path, '/');
    assert.equal(cookie.domain, '127.0.0.1');
    assert.ok(cookie.expires > Date.now() / 1000 && cookie.expires <= Date.now() / 1000 + 7 * 86400);
    const stored = await page.evaluate(() => ({
      local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie,
    }));
    assert.equal(stored.local.token, undefined);
    for (const secret of [token, cookie.value]) {
      assert.ok(typeof secret === 'string' && secret.length > 0);
      assert.equal(JSON.stringify(stored).includes(secret), false, 'Credentials must not be accessible through browser storage');
    }
    return cookie.value;
  }

  // Separate contexts avoid carrying the intentional recovery marker from a
  // failed restore into the next anonymous-route check.
  for (const path of ['/dashboard', '/activity', '/my-tasks', '/profile', '/boards/000000000000000000000001']) {
    const page = await newPage();
    const resourceRequests = [];
    page.on('request', (req) => {
      if (req.url().startsWith(`${apiOrigin}/api/v1/`) && !req.url().includes('/auth/')) resourceRequests.push(req.url());
    });
    await page.goto(`${origin}${path}`);
    await page.getByRole('heading', { name: 'Log in to SDLCFlow' }).waitFor();
    assert.deepEqual(resourceRequests, [], 'Protected children must not fetch data while signed out');
    await page.context().close();
  }
  console.log('PASS anonymous protected routes');

  const page = await newPage();
  await page.goto(`${origin}/login`);
  await page.getByRole('heading', { name: 'Log in to SDLCFlow' }).waitFor();
  // A stale token from a pre-cutover tab must be removed, never restored.
  await page.evaluate(() => localStorage.setItem('token', 'legacy-token-must-not-be-used'));
  const authorizations = [];
  page.on('request', (req) => authorizations.push(req.headers().authorization || ''));
  await page.reload();
  await page.getByLabel('Email', { exact: true }).fill('browser@example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  let response = authResponse(page, 'login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  assert.equal((await response).status(), 401);
  await page.getByRole('button', { name: 'Log in', exact: true }).waitFor();
  assert.equal(await dashboard(page).count(), 0);
  assert.equal((await page.context().cookies(apiOrigin)).length, 0);
  await page.getByLabel('Password', { exact: true }).fill(password);
  response = authResponse(page, 'login');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const login = await response;
  assert.equal(login.status(), 200);
  const loginToken = (await login.json()).data.token;
  await dashboard(page).waitFor();
  const oldCookie = await checkSecrets(page, loginToken);
  assert.equal(authorizations.some((value) => value.includes('legacy-token')), false);
  console.log('PASS failed/successful login, legacy-token removal, cookie flags and memory-only credentials');

  response = authResponse(page, 'refresh');
  await page.reload();
  const refresh = await response;
  assert.equal(refresh.status(), 200);
  await dashboard(page).waitFor();
  const refreshedToken = (await refresh.json()).data.token;
  assert.notEqual(await checkSecrets(page, refreshedToken), oldCookie, 'Reload must rotate the refresh cookie');
  console.log('PASS reload restoration and cookie rotation');

  // Hold identity resolution after successful rotation: the protected tree must
  // stay absent. Then simulate an outage and prove explicit retry recovers.
  let releaseIdentity;
  const held = new Promise((resolve) => { releaseIdentity = resolve; });
  const reachedIdentity = page.waitForRequest((req) => req.url().endsWith('/api/v1/auth/me'));
  await page.route('**/api/v1/auth/me', async (route) => {
    await held;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary identity outage' }) });
  });
  await page.reload();
  await reachedIdentity;
  assert.equal(await dashboard(page).count(), 0);
  releaseIdentity();
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.equal(await dashboard(page).count(), 0);
  await page.unroute('**/api/v1/auth/me');
  let retryRotations = 0;
  page.on('request', (req) => { if (req.url().endsWith('/auth/refresh')) retryRotations++; });
  await page.getByRole('button', { name: 'Try again' }).click();
  await dashboard(page).waitFor();
  assert.equal(retryRotations, 0, 'Identity retry must reuse the in-memory access token');
  console.log('PASS pending/failed restoration hides protected content; identity retry avoids rotation');
  await page.context().close();

  const signup = await newPage();
  await signup.goto(`${origin}/register`);
  await signup.getByLabel('Name', { exact: true }).fill('Signup Tester');
  await signup.getByLabel('Email', { exact: true }).fill('signup@example.test');
  await signup.getByLabel('Password', { exact: true }).fill(password);
  response = authResponse(signup, 'register');
  await signup.getByRole('button', { name: 'Create account', exact: true }).click();
  const registered = await response;
  assert.equal(registered.status(), 201);
  await dashboard(signup, 'Signup').waitFor();
  await checkSecrets(signup, (await registered.json()).data.token);
  await signup.reload();
  await dashboard(signup, 'Signup').waitFor();
  console.log('PASS signup and new-account reload restoration');

  let failedRefreshes = 0;
  await signup.route('**/api/v1/auth/refresh', async (route) => {
    failedRefreshes++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary refresh outage' } }) });
  });
  await signup.reload();
  await signup.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(await dashboard(signup, 'Signup').count(), 0);
  assert.equal(failedRefreshes, 1);
  await signup.reload();
  await signup.getByRole('link', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(failedRefreshes, 1, 'An uncertain refresh must not be replayed on reload');
  console.log('PASS failed refresh requires sign-in and is not replayed on reload');

  const blocked = await newPage();
  await blocked.addInitScript(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'token') throw new DOMException('Storage disabled for test', 'SecurityError');
      return remove.call(this, key);
    };
  });
  const blockedRequests = [];
  blocked.on('request', (req) => { if (req.url().startsWith(`${apiOrigin}/api/v1/`)) blockedRequests.push(req.url()); });
  await blocked.goto(`${origin}/dashboard`);
  await blocked.getByRole('alert').filter({ hasText: 'Browser storage is unavailable' }).waitFor();
  assert.equal(await dashboard(blocked).count(), 0);
  assert.deepEqual(blockedRequests, [], 'Failed legacy-token cleanup must prevent auth and resource requests');
  console.log('PASS blocked storage fails closed before API requests');
  await checkRenewal({ newPage, origin, apiOrigin, io, password });
  assert.deepEqual(problems, [], 'No uncaught browser exceptions');
  console.log(`All chunk 1 and 2 auth checks passed in Chromium ${browser.version()}. Production HTTPS and multi-tab checks remain separate.`);
} finally {
  // These handles belong only to this runner, never the user's dev processes.
  await browser?.close();
  await vite?.close();
  if (io) await new Promise((resolve) => io.close(resolve));
  if (api?.listening) await new Promise((resolve) => { api.close(resolve); api.closeAllConnections(); });
  await mongoose.disconnect();
  await mongo?.stop();
  await rm(scratch, { recursive: true, force: true });
}
