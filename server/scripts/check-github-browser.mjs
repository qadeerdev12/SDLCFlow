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
import { chromium, webkit, firefox } from 'playwright';
import { Server } from 'socket.io';
import { createApp } from '../src/app.js';
import { configureSockets } from '../src/socket.js';
import User from '../src/models/User.js';
import GitHubAccount from '../src/models/GitHubAccount.js';
import GitHubOAuthState from '../src/models/GitHubOAuthState.js';

// This process never loads .env. Every provider fetch is intercepted below,
// and every browser HTTP request is restricted to our servers or a fake page.
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'github-browser-test-only-signing-key',
  GITHUB_CLIENT_ID: 'browser-fixture', GITHUB_CLIENT_SECRET: 'fixture-only',
  GITHUB_TOKEN_ENCRYPTION_KEY: 'github-browser-test-only-encryption-key',
});
const engines = { chromium, webkit, firefox };
const engine = process.env.PLAYWRIGHT_BROWSER || 'chromium';
assert.ok(Object.hasOwn(engines, engine), 'Choose chromium, webkit or firefox');
assert.ok(!process.env.PLAYWRIGHT_CHANNEL || engine === 'chromium', 'Channel requires Chromium');
const root = fileURLToPath(new URL('../../client/', import.meta.url));
const requireClient = createRequire(join(root, 'package.json'));
const { createServer } = await import(pathToFileURL(requireClient.resolve('vite')).href);
const scratch = await mkdtemp(join(tmpdir(), 'sdlcflow-github-browser-'));
const password = 'Disposable browser passphrase 2026!';
const cookieName = 'sdlcflow_github_oauth_dev';
const originalFetch = globalThis.fetch;
let mongo, api, vite, io, browser, exchanges = 0, providerFailure = false;
const problems = [];
const callbackCookies = [];

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  if (url === 'https://github.com/login/oauth/access_token') {
    exchanges++;
    const body = JSON.parse(options.body);
    assert.equal(body.client_id, 'browser-fixture');
    assert.equal(body.code, 'fixture-code');
    assert.equal(body.redirect_uri, process.env.GITHUB_CALLBACK_URL);
    if (providerFailure) return json({ error: 'fixture_failure' }, 502);
    return json({ access_token: 'fixture-provider-token', token_type: 'bearer', scope: 'read:user,user:email,repo' });
  }
  if (url === 'https://api.github.com/user') return json({ id: 456, login: 'fixture-github', name: 'Fixture GitHub' });
  if (url === 'https://api.github.com/user/emails') return json([{ email: 'fixture@example.test', primary: true, verified: true }]);
  if (url.startsWith('https://api.github.com/user/repos?')) return json([]);
  if (url === 'https://api.github.com/graphql') return json({ data: { viewer: {} } });
  problems.push('Unexpected server fetch blocked');
  throw new Error('Unexpected server fetch blocked');
};

try {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await GitHubOAuthState.init();
  const passwordHash = await bcrypt.hash(password, 10);
  api = http.createServer();
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  const callbackPath = '/api/v1/integrations/github/callback';
  process.env.GITHUB_CALLBACK_URL = apiOrigin + callbackPath;
  vite = await createServer({ root, configFile: join(root, 'vite.config.js'), envDir: false,
    cacheDir: join(scratch, 'vite-cache'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${apiOrigin}/api/v1`),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(apiOrigin) },
    server: { host: '127.0.0.1', port: 0, open: false },
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.CLIENT_ORIGIN = origin;
  process.env.CLIENT_URL = origin;
  const app = createApp();
  api.on('request', (req, res) => {
    // Observe the receiving server, not Playwright's request headers: WebKit
    // does not consistently expose Cookie headers for redirected navigation.
    // Values remain in this disposable process and are never printed.
    if (new URL(req.url, apiOrigin).pathname === callbackPath) callbackCookies.push(req.headers.cookie || '');
    app(req, res);
  });
  io = new Server(api, { cors: { origin } });
  app.set('io', io);
  configureSockets(io);
  browser = await engines[engine].launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });

  async function fixture(name) {
    const email = `${name}@example.test`;
    const user = await User.create({ name: 'OAuth Tester', email, passwordHash });
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if ([origin, apiOrigin].includes(url.origin)) return route.continue();
      if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/authorize') {
        assert.equal(url.searchParams.get('client_id'), 'browser-fixture');
        assert.equal(url.searchParams.get('redirect_uri'), process.env.GITHUB_CALLBACK_URL);
        const state = url.searchParams.get('state');
        assert.match(state, /^[a-f0-9]{64}$/);
        // The actual browser location is cross-site. Clicking a link models
        // GitHub's top-level GET return, rather than bypassing cookies via fetch.
        const accept = `${apiOrigin}${callbackPath}?state=${state}&code=fixture-code`;
        const deny = `${apiOrigin}${callbackPath}?state=${state}&error=access_denied`;
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
          <h1>Simulated GitHub</h1><a href="${accept.replaceAll('&', '&amp;')}">Authorize fixture</a>
          <a href="${deny.replaceAll('&', '&amp;')}">Cancel fixture</a>` });
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: "OAuth's projects", exact: true }).waitFor();
    await page.goto(`${origin}/profile`);
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).waitFor();
    return { page, context, user };
  }

  async function start({ page, context }) {
    await page.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await page.getByRole('heading', { name: 'Simulated GitHub' }).waitFor();
    const cookies = await context.cookies(apiOrigin);
    const binding = cookies.find((cookie) => cookie.name === cookieName);
    assert.ok(binding, 'Cross-port start must store binding cookie');
    assert.equal(binding.httpOnly, true);
    assert.equal(binding.sameSite, 'Lax');
    assert.equal(binding.secure, false, 'Only loopback test mode uses an insecure cookie');
    assert.equal(binding.path, '/');
    assert.equal(binding.domain, '127.0.0.1');
    assert.ok(binding.expires > Date.now() / 1000 && binding.expires <= Date.now() / 1000 + 600);
    assert.equal(cookies.find((cookie) => cookie.name === 'sdlcflow_refresh_dev').sameSite, 'Strict');
    return { binding, url: await page.getByRole('link', { name: 'Authorize fixture' }).getAttribute('href') };
  }

  async function finish(page, label, status) {
    const response = page.waitForResponse((res) => new URL(res.url()).pathname === callbackPath);
    await page.getByRole('link', { name: label }).click();
    const returned = await response;
    assert.equal(returned.status(), 302);
    assert.equal(returned.headers().location, `${origin}/profile?github=${status}`);
    assert.equal(returned.headers()['cache-control'], 'no-store');
    assert.equal(returned.headers()['referrer-policy'], 'no-referrer');
    return returned;
  }

  const success = await fixture('success');
  const first = await start(success);
  // Prove HttpOnly from an app-origin document, not merely cookie metadata.
  const tab = await success.context.newPage();
  await tab.goto(`${origin}/profile`);
  const visible = await tab.evaluate(() => JSON.stringify({ cookie: document.cookie, local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.ok(!visible.includes(first.binding.value));
  await tab.close();
  await finish(success.page, 'Authorize fixture', 'connected');
  assert.equal(callbackCookies.length, 1);
  const sentCookies = callbackCookies[0];
  assert.ok(sentCookies.includes(cookieName + '='), 'Lax binding must accompany cross-site return');
  assert.ok(!sentCookies.includes('sdlcflow_refresh_dev='), 'Strict refresh must not accompany cross-site return');
  await success.page.getByRole('button', { name: 'Disconnect', exact: true }).waitFor();
  assert.equal(await GitHubAccount.countDocuments({ user: success.user._id }), 1);
  assert.ok(!(await success.context.cookies(apiOrigin)).some((cookie) => cookie.name === cookieName));
  assert.equal(exchanges, 1);
  // Restore the old cookie intentionally: replay must fail in storage, not
  // merely because the browser accepted the success response's cookie deletion.
  await success.context.addCookies([first.binding]);
  const replay = success.page.waitForResponse((res) => new URL(res.url()).pathname === callbackPath);
  await success.page.goto(first.url);
  assert.equal((await replay).headers().location, `${origin}/profile?github=error`);
  assert.equal(exchanges, 1);
  await success.context.close();
  console.log('PASS UI connection, cross-site Lax/Strict behavior, HttpOnly, cookie clearing and replay rejection');

  for (const kind of ['cancel', 'missing-cookie', 'expired', 'logout', 'provider-failure']) {
    const ctx = await fixture(kind);
    // Keep an existing connection to prove failures never overwrite it. Seed
    // after rendering the unconnected UI, which permits starting a new attempt.
    const existing = await GitHubAccount.create({ user: ctx.user._id, githubId: `old-${kind}`,
      username: `existing-${kind}`, accessToken: 'old-fixture-token', scopes: ['repo'] });
    await start(ctx);
    const count = exchanges;
    if (kind === 'missing-cookie') await ctx.context.clearCookies({ name: cookieName });
    if (kind === 'expired') await GitHubOAuthState.updateOne({ user: ctx.user._id }, { expiresAt: new Date(Date.now() - 1000) });
    if (kind === 'logout') {
      const otherTab = await ctx.context.newPage();
      await otherTab.goto(`${origin}/profile`);
      await otherTab.getByRole('button', { name: 'Log out everywhere', exact: true }).click();
      const dialog = otherTab.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'Log out everywhere', exact: true }).click();
      await otherTab.getByRole('heading', { name: 'Log in to SDLCFlow' }).waitFor();
      await otherTab.close();
    }
    providerFailure = kind === 'provider-failure';
    await finish(ctx.page, kind === 'cancel' ? 'Cancel fixture' : 'Authorize fixture', kind === 'cancel' ? 'missing_code' : 'error');
    providerFailure = false;
    assert.equal(exchanges, count + (kind === 'provider-failure' ? 1 : 0));
    const stored = await GitHubAccount.findById(existing._id).select('+accessToken');
    assert.equal(stored.username, `existing-${kind}`);
    assert.equal(stored.getAccessToken(), 'old-fixture-token');
    await ctx.context.close();
    console.log(`PASS ${kind}: connection unchanged; no unauthorized code exchange`);
  }
  assert.deepEqual(problems, [], 'No browser exceptions or unexpected server fetches');
  console.log(`GitHub browser checks passed in ${engine} ${browser.version()}. Provider simulated; production HTTPS and real GitHub remain manual gates.`);
} finally {
  await browser?.close();
  await vite?.close();
  if (io) await new Promise((resolve) => io.close(resolve));
  if (api?.listening) await new Promise((resolve) => { api.close(resolve); api.closeAllConnections(); });
  await mongoose.disconnect();
  await mongo?.stop();
  globalThis.fetch = originalFetch;
  await rm(scratch, { recursive: true, force: true });
}
