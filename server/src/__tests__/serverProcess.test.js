// Exercise real signals against an isolated child process, database and socket.
// No developer env files or live accounts are used; finally kills only our child
// if a failed assertion would otherwise leave it running.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io } from 'socket.io-client';

let mongo, directory;
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    directory = await mkdtemp(join(tmpdir(), 'sdlcflow-process-'));
}, 60000);
afterAll(async () => { await mongo?.stop(); await rm(directory, { recursive: true, force: true }); });

it.each(['SIGTERM', 'SIGINT'])('handles %s with a real database and connected socket', async (signal) => {
    // Empty cwd prevents dotenv loading the developer's configuration. Explicit
    // environment prevents credentials or production URLs leaking into this run.
    const child = spawn(process.execPath, [fileURLToPath(new URL('../index.js', import.meta.url))], {
        cwd: directory, env: {
            PATH: process.env.PATH, HOME: process.env.HOME,
            NODE_ENV: 'test', MONGO_URI: mongo.getUri(), PORT: '0',
            JWT_SECRET: 'isolated-process-test-key', CLIENT_ORIGIN: 'http://127.0.0.1:5173',
            REGISTRATION_MODE: 'open', AI_ENABLED: 'false',
        }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    // close also waits for stdout/stderr to flush before log assertions.
    const exited = once(child, 'close');
    let output = '';
    let socket;
    try {
        const port = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Isolated server did not start')), 15000);
            child.once('error', (err) => { clearTimeout(timer); reject(err); });
            child.once('exit', () => { clearTimeout(timer); reject(new Error('Isolated server exited before startup')); });
            child.stdout.on('data', (chunk) => {
                output += chunk.toString();
                const match = output.match(/listening on port (\d+)/);
                if (match) { clearTimeout(timer); resolve(Number(match[1])); }
            });
            child.stderr.on('data', (chunk) => { output += chunk.toString(); });
        });
        const origin = `http://127.0.0.1:${port}`;
        const ready = await fetch(`${origin}/ready`);
        expect(ready.status).toBe(200);
        expect(await ready.json()).toEqual({ status: 'ready' });
        const registration = await fetch(`${origin}/api/v1/auth/register`, {
            method: 'POST', headers: { Origin: 'http://127.0.0.1:5173',
                'X-SDLCFlow-CSRF': '1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Signal Test', email: `${signal.toLowerCase()}@example.test`,
                password: 'Disposable signal-test passphrase' }),
        });
        expect(registration.status).toBe(201);
        const { data } = await registration.json();
        socket = io(origin, { auth: { token: data.token }, transports: ['websocket'], reconnection: false });
        await new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('connect_error', reject);
        });
        const disconnected = once(socket, 'disconnect');
        child.kill(signal);
        await disconnected;
        expect(await exited).toEqual([0, null]);
        expect(output).toContain('Server shutdown complete');
        expect(output).not.toContain(mongo.getUri());
        expect(output).not.toContain(data.token);
    } finally {
        socket?.disconnect();
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
            await exited;
        }
    }
}, 30000);
