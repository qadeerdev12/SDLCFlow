import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import createAuthRoutes from '../routes/authRoutes.js';
import { createApp } from '../app.js';
import { configureSockets } from '../socket.js';
import User from '../models/User.js';
import RefreshSession from '../models/RefreshSession.js';
import { AUTH_LIMITS } from '../middleware/authRateLimit.js';

let mongo, io;
const clients = [];
const origin = 'https://app.example.com';
const password = 'original integration passphrase';
const email = 'integration@example.com';
beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'auth-integration-secret');
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
    const app = express();
    app.use('/api/v1/auth', createAuthRoutes({ refresh: { origins: [origin] } }));
    const http = createServer(app);
    io = new Server(http);
    app.set('io', io);
    configureSockets(io);
    await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
    const user = await User.create({ name: 'Test', email, passwordHash: await bcrypt.hash(password, 4), sessionVersion: 2 });
    const send = (path, method = 'post') => request(app)[method](`/api/v1/auth/${path}`)
        .set('Origin', origin).set('X-SDLCFlow-CSRF', '1');
    const login = (body = { email, password }) => send('login').send(body);
    const me = (token) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    const connect = (token) => {
        const socket = createClient(`http://127.0.0.1:${http.address().port}`, {
            auth: { token }, autoConnect: false, reconnection: false, forceNew: true,
        });
        clients.push(socket);
        return new Promise((resolve, reject) => {
            socket.once('connect', () => resolve(socket));
            socket.once('connect_error', reject);
            socket.connect();
        });
    };
    return { app, user, send, login, me, connect };
}
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
const cleared = (response) => expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');

describe('opt-in login and account session integration', () => {
    it('registers a family-bound session without exposing the refresh secret or internal user fields', async () => {
        const ctx = await fixture();
        const result = await ctx.send('register').send({ name: 'New', email: 'new@example.com', password,
            sessionVersion: 99, sid: 'injected' }).expect(201);
        const claims = jwt.verify(result.body.data.token, process.env.JWT_SECRET);
        expect(claims).toMatchObject({ purpose: 'access', sessionVersion: 0 });
        expect(claims.exp - claims.iat).toBe(900);
        expect(result.body.data.user).toEqual({ id: claims.id, name: 'New', email: 'new@example.com' });
        expect(Object.keys(result.body.data).sort()).toEqual(['expiresAt', 'token', 'user']);
        const record = await RefreshSession.findById(claims.sid).lean();
        expect(String(record.user)).toBe(claims.id);
        expect(cookie(result)).toMatch(/^__Host-sdlcflow_refresh=/);
        expect(JSON.stringify(result.body)).not.toContain(cookie(result).split('=')[1]);
        expect(result.headers['cache-control']).toBe('no-store');
        await ctx.me(result.body.data.token).expect(200);
        await ctx.connect(result.body.data.token);
    });

    it('logs in, renews, and logs out using the same configured auth router', async () => {
        const ctx = await fixture();
        const login = await ctx.login().expect(200);
        expect(jwt.decode(login.body.data.token).sessionVersion).toBe(2);
        const socket = await ctx.connect(login.body.data.token);
        const refresh = await ctx.send('refresh').set('Cookie', cookie(login)).send({}).expect(200);
        expect(cookie(refresh)).not.toBe(cookie(login));
        await ctx.me(refresh.body.data.token).expect(200);
        const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
        const logout = await ctx.send('logout').set('Cookie', cookie(refresh)).send({}).expect(200);
        cleared(logout);
        await disconnected;
        await ctx.me(login.body.data.token).expect(401);
        await ctx.me(refresh.body.data.token).expect(401);
    });

    it.each(['login', 'register'])('rejects untrusted %s before creating any session', async (path) => {
        const ctx = await fixture();
        const result = await ctx.send(path).set('Origin', 'https://evil.example.com')
            .send({ name: 'New', email: 'new@example.com', password }).expect(403);
        expect(result.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments()).toBe(0);
        expect(await User.countDocuments()).toBe(1);
    });

    it('does not issue cookies or records for wrong credentials, duplicate signup, or invalid inputs', async () => {
        const ctx = await fixture();
        const failures = [await ctx.login({ email, password: 'wrong' }).expect(401),
            await ctx.send('register').send({ name: 'Test', email, password }).expect(409),
            await ctx.send('register').send({ name: 'Test', email: 'other@example.com', password: 'short' }).expect(400)];
        for (const response of failures) expect(response.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments()).toBe(0);
    });

    it('keeps existing sessions valid when another login fails to persist a family', async () => {
        const ctx = await fixture();
        const existing = await ctx.login().expect(200);
        vi.spyOn(RefreshSession, 'create').mockRejectedValueOnce(new Error('Storage unavailable'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const failed = await ctx.login().expect(500);
        expect(failed.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments()).toBe(1);
        await ctx.me(existing.body.data.token).expect(200);
    });

    it('cleans up an unissued family if access-token signing fails', async () => {
        const ctx = await fixture();
        vi.spyOn(jwt, 'sign').mockImplementationOnce(() => { throw new Error('Signing failed'); });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const failed = await ctx.login().expect(500);
        expect(failed.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments()).toBe(0);
        await ctx.login().expect(200);
    });

    it('allows login recovery if registration created the account but session storage failed', async () => {
        const ctx = await fixture();
        vi.spyOn(RefreshSession, 'create').mockRejectedValueOnce(new Error('Storage unavailable'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await ctx.send('register').send({ name: 'New', email: 'new@example.com', password }).expect(500);
        expect(await User.countDocuments({ email: 'new@example.com' })).toBe(1);
        await ctx.login({ email: 'new@example.com', password }).expect(200);
    });

    it.each(['password', 'logout-all'])('%s invalidates all families and clears the cookie after success', async (action) => {
        const ctx = await fixture();
        const first = await ctx.login().expect(200), second = await ctx.login().expect(200);
        const socket = await ctx.connect(second.body.data.token);
        const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
        const replacement = 'replacement integration passphrase';
        const response = await ctx.send(action, action === 'password' ? 'patch' : 'post')
            .set('Authorization', `Bearer ${first.body.data.token}`).set('Cookie', cookie(first))
            .send(action === 'password' ? { currentPassword: password, newPassword: replacement } : {}).expect(200);
        cleared(response);
        await disconnected;
        for (const login of [first, second]) {
            await ctx.me(login.body.data.token).expect(401);
            await ctx.send('refresh').set('Cookie', cookie(login)).send({}).expect(401);
        }
        const fresh = await ctx.login({ email, password: action === 'password' ? replacement : password }).expect(200);
        expect(jwt.decode(fresh.body.data.token).sessionVersion).toBe(3);
        await ctx.me(fresh.body.data.token).expect(200);
        await ctx.connect(fresh.body.data.token);
    });

    it.each([['password', 'patch'], ['logout-all', 'post'], ['me', 'delete']])('guards cookie-changing %s actions', async (path, method) => {
        const ctx = await fixture();
        const login = await ctx.login().expect(200);
        const result = await request(ctx.app)[method](`/api/v1/auth/${path}`)
            .set('Authorization', `Bearer ${login.body.data.token}`)
            .send({ password, currentPassword: password, newPassword: 'replacement passphrase' }).expect(403);
        expect(result.headers['set-cookie']).toBeUndefined();
        await ctx.me(login.body.data.token).expect(200);
    });

    it('preserves cookie and family after wrong current password or failed logout-all write', async () => {
        const ctx = await fixture();
        const login = await ctx.login().expect(200);
        const wrong = await ctx.send('password', 'patch').set('Authorization', `Bearer ${login.body.data.token}`)
            .send({ currentPassword: 'wrong', newPassword: 'replacement passphrase' }).expect(401);
        expect(wrong.headers['set-cookie']).toBeUndefined();
        vi.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Write unavailable'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const failed = await ctx.send('logout-all').set('Authorization', `Bearer ${login.body.data.token}`).send({}).expect(500);
        expect(failed.headers['set-cookie']).toBeUndefined();
        await ctx.me(login.body.data.token).expect(200);
        await ctx.send('refresh').set('Cookie', cookie(login)).send({}).expect(200);
    });

    it('deletes all of an account\'s refresh records without affecting another account', async () => {
        const ctx = await fixture();
        const first = await ctx.login().expect(200);
        await ctx.login().expect(200);
        const other = await ctx.send('register').send({ name: 'Other', email: 'other@example.com', password }).expect(201);
        const socket = await ctx.connect(first.body.data.token);
        const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
        const deleted = await ctx.send('me', 'delete').set('Authorization', `Bearer ${first.body.data.token}`)
            .send({ password }).expect(200);
        cleared(deleted);
        await disconnected;
        expect(await RefreshSession.countDocuments({ user: ctx.user._id })).toBe(0);
        expect(await RefreshSession.countDocuments()).toBe(1);
        await ctx.me(first.body.data.token).expect(401);
        await ctx.send('refresh').set('Cookie', cookie(first)).send({}).expect(401);
        await ctx.me(other.body.data.token).expect(200);
    });

    it('keeps the live app in legacy mode regardless of submitted mode fields', async () => {
        await fixture();
        const app = createApp();
        const result = await request(app).post('/api/v1/auth/login').send({ email, password, refresh: true }).expect(200);
        const claims = jwt.decode(result.body.data.token);
        expect(claims.sid).toBeUndefined();
        expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
        expect(result.headers['set-cookie']).toBeUndefined();
        await request(app).post('/api/v1/auth/refresh').send({}).expect(404);
    });

    it('retains throttle-before-parse ordering in the opt-in login flow', async () => {
        const ctx = await fixture();
        for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
            await request(ctx.app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(403);
        }
        const blocked = await ctx.login().expect(429);
        expect(blocked.headers['cache-control']).toBe('no-store');
        expect(blocked.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments()).toBe(0);
    });

    it('does not remove records or clear cookies when deletion password verification fails', async () => {
        const ctx = await fixture();
        const login = await ctx.login().expect(200);
        const failed = await ctx.send('me', 'delete').set('Authorization', `Bearer ${login.body.data.token}`)
            .send({ password: 'wrong' }).expect(401);
        expect(failed.headers['set-cookie']).toBeUndefined();
        expect(await RefreshSession.countDocuments({ user: ctx.user._id })).toBe(1);
        await ctx.me(login.body.data.token).expect(200);
    });
});
