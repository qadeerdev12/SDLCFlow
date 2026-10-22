import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import request from 'supertest';
import { createApp } from '../app.js';

let directory;
let app;
const html = '<!doctype html><html><body>SDLCFlow test build</body></html>';

beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'sdlcflow-static-'));
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), html);
    writeFileSync(join(directory, 'assets', 'app-Abc123.js'), 'console.log("fixture");');
    writeFileSync(join(directory, 'logo.svg'), '<svg></svg>');
    writeFileSync(join(directory, '.secret'), 'must not be served');
    app = createApp({ clientBuild: directory });
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it.each(['/', '/login', '/register', '/dashboard', '/activity', '/my-tasks', '/profile',
    '/boards/123', '/boards/123/activity', '/boards/123/?workflow=456'])(
    'serves the application for direct navigation to %s', async (path) => {
        const response = await request(app).get(path).expect(200).expect('Content-Type', /html/);
        expect(response.text).toBe(html);
        expect(response.headers['cache-control']).toBe('no-cache');
    },
);

it('supports HEAD and distinguishes immutable assets from public files', async () => {
    await request(app).head('/dashboard').expect(200).expect('Cache-Control', 'no-cache');
    await request(app).get('/assets/app-Abc123.js').expect(200)
        .expect('Cache-Control', 'public, max-age=31536000, immutable')
        .expect('X-Content-Type-Options', 'nosniff');
    await request(app).get('/logo.svg').expect(200).expect('Cache-Control', 'no-cache');
});

it.each(['/api/v1/missing', '/api', '/socket.io/missing', '/health/missing',
    '/assets/missing.js', '/missing.js', '/.secret', '/unknown-page', '/boards/missing.js'])(
    'does not turn %s into a successful HTML response', async (path) => {
        const response = await request(app).get(path).expect(404).expect('Content-Type', /json/);
        expect(response.body.error.code).toBe('NOT_FOUND');
    },
);

it('preserves API authentication, health and non-GET semantics', async () => {
    await request(app).get('/api/v1/boards').expect(401).expect('Content-Type', /json/);
    await request(app).get('/health').expect(200).expect('Content-Type', /json/);
    await request(app).post('/dashboard').send({}).expect(404);
    await request(app).post('/api/v1/missing').send({}).expect(404);
});

it('keeps Socket.IO polling on the shared HTTP server', async () => {
    const server = createServer(app);
    const io = new Server(server);
    try {
        const response = await request(server).get('/socket.io/?EIO=4&transport=polling').expect(200);
        expect(response.text.startsWith('0')).toBe(true);
        expect(JSON.parse(response.text.slice(1)).upgrades).toContain('websocket');
    } finally {
        await new Promise((resolve) => io.close(resolve));
    }
});

it('fails early without a build and leaves API-only development unchanged', async () => {
    expect(() => createApp({ clientBuild: join(directory, 'absent') })).toThrow('React build missing');
    const response = await request(createApp()).get('/').expect(200);
    expect(response.body.name).toBe('SDLCFlow API');
});
