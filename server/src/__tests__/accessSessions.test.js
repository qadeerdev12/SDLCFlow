import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from './helpers/http.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { createApp } from '../app.js';
import { configureSockets } from '../socket.js';
import createRefreshRoutes from '../routes/refreshRoutes.js';
import { createAccessToken } from '../utils/accessTokens.js';
import { createRefreshSession } from '../services/refreshSessionService.js';
import RefreshSession, { MAX_REFRESH_ROTATIONS } from '../models/RefreshSession.js';
import User from '../models/User.js';

let mongo, io;
const clients = [];
beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'access-family-test-secret');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => {
    vi.restoreAllMocks();
    clients.splice(0).forEach((socket) => socket.disconnect());
    if (io) await new Promise((resolve) => io.close(resolve));
    io = undefined;
    await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

async function fixture() {
    const user = await User.create({ name: 'Test', email: 'access@example.com', passwordHash: 'unused', sessionVersion: 2 });
    const family = await createRefreshSession(user);
    const { token } = createAccessToken(family);
    const app = createApp();
    // A separate mount exercises isolated family rotation/eviction scenarios.
    app.use('/test-auth', createRefreshRoutes({ origins: ['https://app.example.com'] }));
    const http = createServer(app);
    io = new Server(http);
    app.set('io', io);
    configureSockets(io);
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    const connect = (credential = token) => {
        const socket = createClient(`http://127.0.0.1:${http.address().port}`, {
            auth: { token: credential }, autoConnect: false, reconnection: false, forceNew: true,
        });
        clients.push(socket);
        return new Promise((resolve, reject) => {
            socket.once('connect', () => resolve(socket));
            socket.once('connect_error', reject);
            socket.connect();
        });
    };
    return { app, user, family, token, connect,
        me: (credential = token) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${credential}`),
        action: (path, credential = family.credential) => request(app).post(`/test-auth/${path}`)
            .set('Origin', 'https://app.example.com').set('X-SDLCFlow-CSRF', '1')
            .set('Cookie', `__Host-sdlcflow_refresh=${credential}`).send({}),
    };
}

function sign(ctx, changes = {}, remove = []) {
    const claims = { ...jwt.decode(ctx.token), ...changes };
    remove.forEach((field) => delete claims[field]);
    return jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS256' });
}
function ended(socket) {
    const notices = [];
    socket.on('session:invalidated', (notice) => notices.push(notice.code));
    return new Promise((resolve) => socket.once('disconnect', () => resolve(notices)));
}
async function denied(ctx, token, code) {
    expect((await ctx.me(token).expect(401)).body.error.code).toBe(code);
    await expect(ctx.connect(token)).rejects.toMatchObject({ data: { code } });
}

describe('REST and socket access-family validation', () => {
    it('accepts a current family but rejects legacy JWTs over both transports', async () => {
        const ctx = await fixture();
        await ctx.me().expect(200);
        await ctx.connect();
        const legacy = jwt.sign({ id: ctx.user.id, sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
        await denied(ctx, legacy, 'INVALID_TOKEN');
    });

    it.each(['sid', 'purpose', 'iss', 'aud', 'sessionVersion', 'exp'])('rejects missing new-format claim %s without legacy fallback', async (field) => {
        const ctx = await fixture();
        const lookup = vi.spyOn(User, 'findById');
        await denied(ctx, sign(ctx, {}, [field]), 'INVALID_TOKEN');
        expect(lookup).not.toHaveBeenCalled();
    });

    it.each([
        { sid: null }, { sid: { $ne: null } }, { purpose: 'github-oauth' },
        { iss: 'other' }, { aud: 'other' }, { aud: ['sdlcflow-api'] },
        { sessionVersion: '2' },
    ])('rejects malformed scoped claims %j', async (changes) => {
        const ctx = await fixture();
        await denied(ctx, sign(ctx, changes), 'INVALID_TOKEN');
    });

    it('rejects missing iat, overlong/future tokens, tampering, and unexpected signing algorithms', async () => {
        const ctx = await fixture();
        const claims = jwt.decode(ctx.token);
        const missingIat = jwt.sign(claims, process.env.JWT_SECRET, { noTimestamp: true });
        for (const token of [missingIat, sign(ctx, { exp: claims.iat + 901 }),
            sign(ctx, { iat: claims.iat + 3600, exp: claims.iat + 3900 }), `${ctx.token}tampered`,
            jwt.sign(claims, process.env.JWT_SECRET, { algorithm: 'HS384' })]) {
            await denied(ctx, token, 'INVALID_TOKEN');
        }
    });

    it('distinguishes valid-but-expired access tokens from malformed credentials', async () => {
        const ctx = await fixture();
        const now = Math.floor(Date.now() / 1000);
        await denied(ctx, sign(ctx, { iat: now - 100, exp: now - 1 }), 'SESSION_EXPIRED');
    });

    it.each(['revoked', 'expired', 'missing', 'wrong-owner', 'wrong-version'])('rejects a %s family in REST and at handshake', async (state) => {
        const ctx = await fixture();
        const filter = { _id: ctx.family.sessionId };
        if (state === 'missing') await RefreshSession.deleteOne(filter);
        else await RefreshSession.updateOne(filter, state === 'revoked' ? { revokedAt: new Date() }
            : state === 'expired' ? { expiresAt: new Date(0) }
                : state === 'wrong-owner' ? { user: new mongoose.Types.ObjectId() } : { sessionVersion: 3 });
        await denied(ctx, ctx.token, 'SESSION_INVALIDATED');
    });

    it('still enforces account-wide invalidation and account existence', async () => {
        const ctx = await fixture();
        await User.updateOne({ _id: ctx.user._id }, { $inc: { sessionVersion: 1 } });
        await denied(ctx, ctx.token, 'SESSION_INVALIDATED');
        await User.deleteOne({ _id: ctx.user._id });
        await denied(ctx, ctx.token, 'USER_NOT_FOUND');
    });

    it('logout immediately evicts only the matching family, removes rooms, and rejects reconnect', async () => {
        const ctx = await fixture();
        const one = await ctx.connect();
        const two = await ctx.connect();
        const otherFamily = await createRefreshSession(ctx.user);
        const otherToken = createAccessToken(otherFamily).token;
        const other = await ctx.connect(otherToken);
        const board = (await request(ctx.app).post('/api/v1/boards')
            .set('Authorization', `Bearer ${ctx.token}`).send({ name: 'Family project' }).expect(201)).body.data.board;
        await one.timeout(2000).emitWithAck('board:join', { boardId: board._id });
        const firstEnd = ended(one), secondEnd = ended(two);
        await ctx.action('logout').expect(200);
        expect(await firstEnd).toEqual(['SESSION_INVALIDATED']);
        expect(await secondEnd).toEqual(['SESSION_INVALIDATED']);
        expect(io.sockets.adapter.rooms.has(`board:${board._id}`)).toBe(false);
        expect(io.sockets.sockets.has(other.id)).toBe(true);
        await ctx.me(otherToken).expect(200);
        await denied(ctx, ctx.token, 'SESSION_INVALIDATED');
    });

    it('keeps access valid across rotation, but replay evicts the whole family', async () => {
        const ctx = await fixture();
        const socket = await ctx.connect();
        const response = await ctx.action('refresh').expect(200);
        await ctx.me().expect(200);
        await ctx.me(response.body.data.token).expect(200);
        const disconnect = ended(socket);
        expect((await ctx.action('refresh').expect(401)).body.error.code).toBe('REFRESH_REUSED');
        expect(await disconnect).toEqual(['SESSION_INVALIDATED']);
        await denied(ctx, response.body.data.token, 'SESSION_INVALIDATED');
    });

    it('checks family state before dispatching every socket packet', async () => {
        const ctx = await fixture();
        const socket = await ctx.connect();
        const handler = vi.fn();
        io.sockets.sockets.get(socket.id).on('test:mutation', handler);
        await RefreshSession.updateOne({ _id: ctx.family.sessionId }, { revokedAt: new Date() });
        const disconnect = ended(socket);
        socket.emit('test:mutation', {});
        expect(await disconnect).toEqual(['SESSION_INVALIDATED']);
        expect(handler).not.toHaveBeenCalled();
    });

    it('evicts a family when its refresh rotation limit is reached', async () => {
        const ctx = await fixture();
        const socket = await ctx.connect();
        await RefreshSession.updateOne({ _id: ctx.family.sessionId }, { rotationCount: MAX_REFRESH_ROTATIONS });
        const disconnect = ended(socket);
        expect((await ctx.action('refresh').expect(401)).body.error.code).toBe('REFRESH_EXHAUSTED');
        expect(await disconnect).toEqual(['SESSION_INVALIDATED']);
        await ctx.me().expect(401);
    });

    it('preserves access and live sockets when logout persistence fails', async () => {
        const ctx = await fixture();
        const socket = await ctx.connect();
        vi.spyOn(RefreshSession, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Storage unavailable'); });
        await ctx.action('logout').expect(503);
        expect(io.sockets.sockets.has(socket.id)).toBe(true);
        await ctx.me().expect(200);
    });

    it('logout-all still evicts multiple families while a fresh generation remains usable', async () => {
        const ctx = await fixture();
        const first = await ctx.connect();
        const secondFamily = await createRefreshSession(ctx.user);
        const second = await ctx.connect(createAccessToken(secondFamily).token);
        const firstEnd = ended(first), secondEnd = ended(second);
        await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${ctx.token}`)
            .set('Origin', 'http://localhost:5173').set('X-SDLCFlow-CSRF', '1').send({}).expect(200);
        expect(await firstEnd).toEqual(['SESSION_INVALIDATED']);
        expect(await secondEnd).toEqual(['SESSION_INVALIDATED']);
        const updated = await User.findById(ctx.user._id).select('+sessionVersion');
        const fresh = createAccessToken(await createRefreshSession(updated)).token;
        await ctx.me(fresh).expect(200);
        await ctx.connect(fresh);
        await denied(ctx, ctx.token, 'SESSION_INVALIDATED');
    });

    it('blocks a stale pending handshake when logout commits during the family lookup', async () => {
        const ctx = await fixture();
        let read, release;
        const ready = new Promise((resolve) => { read = resolve; });
        const paused = new Promise((resolve) => { release = resolve; });
        const original = RefreshSession.findOne.bind(RefreshSession);
        vi.spyOn(RefreshSession, 'findOne').mockImplementationOnce((...args) => {
            const query = original(...args);
            const exec = query.exec.bind(query);
            query.exec = async () => { const stale = await exec(); read(); await paused; return stale; };
            return query;
        });
        const pending = expect(ctx.connect()).rejects.toMatchObject({ data: { code: 'SESSION_INVALIDATED' } });
        await ready;
        try { await ctx.action('logout').expect(200); } finally { release(); }
        await pending;
        expect(io.sockets.sockets.size).toBe(0);
    });

    it('treats family database outages as temporary in REST, handshakes, and packets', async () => {
        const ctx = await fixture();
        const socket = await ctx.connect();
        const handler = vi.fn((data, ack) => ack({ ok: true }));
        io.sockets.sockets.get(socket.id).on('test:mutation', handler);
        const outage = () => { throw new Error('Database unavailable'); };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(RefreshSession, 'findOne').mockImplementationOnce(outage);
        expect((await ctx.me().expect(503)).body.error.code).toBe('AUTH_UNAVAILABLE');
        vi.spyOn(RefreshSession, 'findOne').mockImplementationOnce(outage);
        await expect(ctx.connect()).rejects.toMatchObject({ data: { code: 'AUTH_UNAVAILABLE' } });
        vi.spyOn(RefreshSession, 'findOne').mockImplementationOnce(outage);
        expect((await socket.timeout(2000).emitWithAck('test:mutation', {})).error.code).toBe('AUTH_UNAVAILABLE');
        expect(handler).not.toHaveBeenCalled();
        expect(socket.connected).toBe(true);
        expect((await socket.timeout(2000).emitWithAck('test:mutation', {})).ok).toBe(true);
        await ctx.me().expect(200);
    });

    it('disconnects an idle family socket at access-token expiry', async () => {
        const ctx = await fixture();
        const now = Math.floor(Date.now() / 1000);
        const socket = await ctx.connect(sign(ctx, { iat: now, exp: now + 2 }));
        expect(await ended(socket)).toEqual(['SESSION_EXPIRED']);
    });
});
