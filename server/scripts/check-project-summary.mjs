import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright';
import { createApp } from '../src/app.js';
import { createFixture, providerFetch, sha } from './summary-check/fixtures.mjs';

// No .env loading, Atlas URI, saved account, or persistent app server is used.
process.env.JWT_SECRET = 'summary-browser-check-only';
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = 'summary-browser-check-only';
process.env.OPENAI_API_KEY = 'fake-openai-key';
process.env.OPENAI_TASK_DRAFT_MODEL = 'fake-model';
const clientRoot = fileURLToPath(new URL('../../client/', import.meta.url));
const clientRequire = createRequire(join(clientRoot, 'package.json'));
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
const originalFetch = globalThis.fetch;
let mongo, api, vite, browser, fixture;
const screenshots = await mkdtemp(join(tmpdir(), 'sdlcflow-summary-check-'));
const problems = [];

try {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  globalThis.fetch = providerFetch(() => fixture);
  api = http.createServer();
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const apiOrigin = `http://127.0.0.1:${api.address().port}`;
  vite = await createServer({
    root: clientRoot, configFile: join(clientRoot, 'vite.config.js'),
    cacheDir: join(screenshots, 'vite-cache'),
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${apiOrigin}/api/v1`) },
    server: { host: '127.0.0.1', port: 0, open: false },
    plugins: [{
      name: 'isolated-summary-check',
      configureServer(server) {
        server.middlewares.use('/__summary-fixture.json', (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ board: { _id: fixture.board.id, name: fixture.board.name }, token: fixture.token }));
        });
        server.middlewares.use('/__summary-check', async (_req, res, next) => {
          try {
            // Test-only entry mounts the real panel/API client, not a fake UI.
            // It is installed only in this runner and never written to client/src.
            const html = await server.transformIndexHtml('/__summary-check', `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module">
              import React from 'react';
              import {createRoot} from 'react-dom/client';
              import {MemoryRouter} from 'react-router-dom';
              import Panel from '/src/components/board/ProjectSummaryPanel.jsx';
              import '/src/index.css';
              const props = await fetch('/__summary-fixture.json', {cache: 'no-store'}).then(response => response.json());
              createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter, null, React.createElement(Panel, {...props, onClose() {}})));
            </script></body></html>`);
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          } catch (err) { next(err); }
        });
      },
    }],
  });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.CLIENT_ORIGIN = origin;
  api.on('request', createApp());
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (err) => problems.push(err.message));
  // Browser requests are also restricted to the two temporary local servers.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if ([origin, apiOrigin].includes(url.origin)) return route.continue();
    problems.push(`Unexpected browser request: ${url.origin}`);
    return route.abort();
  });

  async function open(mode, width = 1440) {
    fixture = await createFixture(mode);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/__summary-check`);
    await page.getByRole('checkbox').waitFor();
    assert.equal(await page.getByRole('checkbox').isChecked(), false);
    assert.deepEqual(fixture.calls, { github: 0, openai: 0 });
  }
  async function generate(includeGitHub, status = 200) {
    await page.getByRole('checkbox').setChecked(includeGitHub);
    const response = page.waitForResponse((res) => res.url().endsWith('/summary') && res.request().method() === 'POST');
    await page.getByRole('button', { name: /^(Generate|Regenerate) summary$/ }).click();
    const result = await response;
    assert.equal(result.url(), `${apiOrigin}/api/v1/boards/${fixture.board.id}/summary`);
    assert.equal(result.status(), status);
    if (status !== 200) await page.getByRole('alert').waitFor();
    else await page.getByText(/Snapshot from/).waitFor();
  }

  await open('task-only');
  await generate(false);
  assert.deepEqual(fixture.calls, { github: 0, openai: 1 });
  assert.equal(await page.getByRole('link', { name: 'API resilience' }).getAttribute('href'), `/boards/${fixture.board.id}?card=${fixture.card.id}`);
  console.log('PASS task-only default and task citation');

  for (const width of [1440, 390]) {
    await open('linked', width);
    await generate(true);
    const source = page.getByRole('link', { name: /aaaaaaa Improve API resilience/ });
    assert.equal(await source.getAttribute('href'), `https://github.com/example/project/commit/${sha}`);
    assert.equal(await source.getAttribute('rel'), 'noopener noreferrer');
    assert.deepEqual(fixture.calls, { github: 1, openai: 1 });
    await source.scrollIntoViewIfNeeded();
    assert.equal(await page.locator('aside').evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await page.screenshot({ path: join(screenshots, `github-${width}.png`) });
    console.log(`PASS linked GitHub summary at ${width}px`);
  }
  await open('unlinked');
  await generate(true);
  await page.getByText(/No repository is linked/).waitFor();
  assert.deepEqual(fixture.calls, { github: 0, openai: 1 });
  console.log('PASS unlinked project');

  await open('commits-only');
  await generate(true);
  await page.getByText('Commit reports improved API resilience.').waitFor();
  assert.equal(await page.getByText('Task snapshot verified.').count(), 0);
  console.log('PASS commit-only project');

  await open('disconnected');
  await generate(true, 409);
  await page.getByText('The GitHub connection needs attention.').waitFor();
  assert.deepEqual(fixture.calls, { github: 0, openai: 0 });
  await page.getByRole('button', { name: 'Use tasks only' }).click();
  await generate(false);
  assert.deepEqual(fixture.calls, { github: 0, openai: 1 });
  console.log('PASS disconnected account and task-only fallback');

  await open('rate-limit');
  await generate(true, 429);
  const button = page.getByRole('button', { name: 'Generate summary' });
  assert.equal(await button.isDisabled(), true);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent === 'Generate summary' && !el.disabled));
  assert.deepEqual(fixture.calls, { github: 1, openai: 0 });
  console.log('PASS secondary rate-limit cooldown without automatic retry');

  await open('timeout');
  await generate(true, 504);
  await page.getByText('GitHub did not respond within 10 seconds.').waitFor();
  assert.deepEqual(fixture.calls, { github: 1, openai: 0 });
  console.log('PASS real 10-second abort before OpenAI');

  await open('revoked');
  await generate(true, 404);
  assert.equal(await page.getByText('Task snapshot verified.').count(), 0);
  assert.equal(await page.getByText('Commit reports improved API resilience.').count(), 0);
  console.log('PASS membership revoked during generation');
  assert.deepEqual(problems, []);
  console.log(`Screenshots: ${resolve(screenshots)}`);
  console.log('All summary browser/API checks passed. Providers were mocked; live AI quality was not evaluated.');
} finally {
  // Close only resources created by this runner, even when an assertion fails.
  await browser?.close();
  await vite?.close();
  if (api?.listening) await new Promise((done) => { api.close(done); api.closeAllConnections(); });
  await mongoose.disconnect();
  await mongo?.stop();
  globalThis.fetch = originalFetch;
}
