// HTTP probes use controlled readiness results; shutdown dependencies are spies.
// This keeps failure/order tests deterministic without exiting the test runner.
// A real HTTP/Socket.IO fixture below additionally verifies response draining.
import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import express from 'express';
import mongoose from 'mongoose';
import request from './helpers/http.js';
import { createApp } from '../app.js';
import { createServerLifecycle, createShutdown, databaseReady } from '../services/serverLifecycle.js';
import { httpError } from '../middleware/httpSafety.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('separates liveness from database readiness without exposing diagnostics', async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const app = createApp({ readiness: probe });
    await request(app).get('/health').expect(200).expect('Cache-Control', 'no-store');
    expect(probe).not.toHaveBeenCalled();
    expect((await request(app).get('/ready').expect(503)).body).toEqual({ status: 'unavailable' });
    probe.mockResolvedValueOnce(true);
    await request(app).get('/ready').expect(200).expect('Cache-Control', 'no-store');
    probe.mockRejectedValueOnce(new Error('secret database address'));
    expect((await request(app).get('/ready').expect(503)).text).not.toContain('secret');
});

it('checks database connectivity with a bounded ping', async () => {
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    expect(await databaseReady()).toBe(false);
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);
    const originalDb = mongoose.connection.db;
    const ping = vi.fn().mockResolvedValue({ ok: 1 });
    mongoose.connection.db = { admin: () => ({ ping }) };
    try {
        expect(await databaseReady()).toBe(true);
        expect(ping).toHaveBeenCalledWith({ timeoutMS: 1000 });
        ping.mockRejectedValueOnce(new Error('offline'));
        expect(await databaseReady()).toBe(false);
    } finally { mongoose.connection.db = originalDb; }
});

it('stops readiness and rejects new work during drain, including a pending probe', async () => {
    const lifecycle = createServerLifecycle();
    const app = createApp({ lifecycle, readiness: async () => { lifecycle.beginDrain(); return true; } });
    await request(app).get('/ready').expect(503);
    await request(app).get('/health').expect(200);
    const response = await request(app).get('/api/v1/boards').expect(503).expect('Retry-After', '5');
    expect(response.body.error.code).toBe('SERVER_DRAINING');
});

it('skips database probes once draining and supports non-cacheable HEAD probes', async () => {
    const lifecycle = createServerLifecycle();
    const probe = vi.fn().mockResolvedValue(true);
    const app = createApp({ lifecycle, readiness: probe });
    await request(app).head('/ready').expect(200).expect('Cache-Control', 'no-store');
    probe.mockClear();
    lifecycle.beginDrain();
    await request(app).head('/ready').expect(503).expect('Cache-Control', 'no-store');
    await request(app).get('/ready').expect(503);
    expect(probe).not.toHaveBeenCalled();
});

it('adds baseline headers and returns JSON errors for malformed bodies and unknown routes', async () => {
    const app = createApp();
    await request(app).get('/health').expect('X-Frame-Options', 'DENY')
        .expect('X-Content-Type-Options', 'nosniff').expect('Referrer-Policy', 'no-referrer')
        .expect((res) => expect(res.headers['x-powered-by']).toBeUndefined());
    const invalid = await request(app).post('/api/v1/missing').set('Content-Type', 'application/json')
        .send('{"private":"value"').expect(400).expect('Cache-Control', 'no-store');
    expect(invalid.body.error.code).toBe('INVALID_JSON');
    expect(invalid.text).not.toContain('private');
    const oversized = await request(app).post('/api/v1/missing').send({ text: 'a'.repeat(110_000) }).expect(413);
    expect(oversized.body.error.code).toBe('BODY_TOO_LARGE');
    await request(app).get('/api/v1/missing').expect(404).expect('Content-Type', /json/);
});

it('does not serialize an unhandled exception to logs or responses', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.get('/', () => { throw new Error('secret token and connection string'); });
    app.use(httpError);
    const response = await request(app).get('/').expect(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.text).not.toContain('secret');
    expect(log).toHaveBeenCalledExactlyOnceWith('Unhandled HTTP request error');
});

function fixture() {
    const lifecycle = createServerLifecycle();
    const steps = [];
    const exit = vi.fn();
    return { lifecycle, steps, exit, options: { lifecycle, exit,
        closeTransport: vi.fn(async () => { steps.push('transport'); }),
        stopSubscriber: vi.fn(() => { steps.push('subscriber'); }),
        disconnectDatabase: vi.fn(async () => { steps.push('database'); }), log: vi.fn(),
    } };
}

it('finishes an accepted HTTP response before disconnecting the database', async () => {
    const ctx = fixture();
    let started, release;
    const accepted = new Promise((resolve) => { started = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const app = express();
    app.get('/slow', async (req, res) => {
        started();
        await gate;
        res.json({ saved: true });
    });
    const server = createServer(app);
    const io = new Server(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const response = request(server).get('/slow').expect(200).then((res) => res.body);
    let shutdown;
    try {
        await accepted;
        // Node's HTTP close waits for an active response even after Socket.IO
        // closes its clients. Keep the database alive until that response ends.
        shutdown = createShutdown({ ...ctx.options, closeTransport: () => io.close() })();
        await Promise.resolve();
        expect(ctx.options.disconnectDatabase).not.toHaveBeenCalled();
        release();
        expect(await response).toEqual({ saved: true });
        await shutdown;
        expect(ctx.exit).toHaveBeenCalledExactlyOnceWith(0);
        expect(ctx.options.disconnectDatabase).toHaveBeenCalledOnce();
    } finally {
        release();
        await response;
        if (shutdown) await shutdown;
        else await io.close();
    }
});

it('drains once, waiting for tracked mutations before closing the database', async () => {
    const ctx = fixture();
    const complete = ctx.lifecycle.track();
    const shutdown = createShutdown(ctx.options);
    const first = shutdown();
    expect(shutdown()).toBe(first);
    expect(ctx.lifecycle.draining).toBe(true);
    await Promise.resolve();
    expect(ctx.steps).toEqual(['transport']);
    complete(); complete();
    await first;
    expect(ctx.steps).toEqual(['transport', 'subscriber', 'database']);
    expect(ctx.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it('enforces the deadline even when draining is stuck', async () => {
    vi.useFakeTimers();
    const ctx = fixture();
    const complete = ctx.lifecycle.track();
    const pending = createShutdown({ ...ctx.options, timeoutMs: 50 })();
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.exit).toHaveBeenCalledWith(1);
    // Real process.exit never returns; release the test double for cleanup.
    complete();
    await pending;
});

// The deadline belongs to the complete shutdown, not just socket mutations.
// Release each stalled dependency after the fake exit so no test work leaks.
it.each(['closeTransport', 'disconnectDatabase'])('bounds a stalled %s', async (phase) => {
    vi.useFakeTimers();
    const ctx = fixture();
    let release;
    ctx.options[phase].mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const pending = createShutdown({ ...ctx.options, timeoutMs: 50 })();
    await vi.advanceTimersByTimeAsync(50);
    expect(ctx.exit).toHaveBeenCalledWith(1);
    release();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
});

it('uses a failing exit status for shutdown failure or startup failure', async () => {
    const ctx = fixture();
    await createShutdown(ctx.options)(1);
    expect(ctx.exit).toHaveBeenCalledExactlyOnceWith(1);
    ctx.exit.mockClear();
    ctx.options.disconnectDatabase.mockRejectedValueOnce(new Error('private driver details'));
    await createShutdown(ctx.options)();
    expect(ctx.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(JSON.stringify(ctx.options.log.mock.calls)).not.toContain('private');
});
