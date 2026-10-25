// Tests the refresh/logout HTTP contract with disposable session storage.
// An isolated router fixture exposes cookie, CSRF, rotation and throttling behavior;
// mounted-app checks ensure the same guards are present in application routing.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express from 'express';
import request from './helpers/http.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import RefreshSession from '../models/RefreshSession.js';
import { createRefreshSession, rotateRefreshSession } from '../services/refreshSessionService.js';
import createRefreshRoutes, { REFRESH_REQUEST_LIMIT } from '../routes/refreshRoutes.js';
import { createApp } from '../app.js';

let mongo;
const origin = 'https://app.example.com';
const name = '__Host-sdlcflow_refresh';
beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'refresh-route-test-secret');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => {
    vi.restoreAllMocks();
    await RefreshSession.deleteMany({});
    await User.deleteMany({});
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

async function setup() {
    const user = await User.create({ name: 'Test', email: 'route@example.com', passwordHash: 'unused', sessionVersion: 4 });
    const session = await createRefreshSession(user);
    const app = express();
    app.use('/auth', createRefreshRoutes({ origins: [origin] }));
    const send = (path = 'refresh', credential = session.credential) => request(app).post(`/auth/${path}`)
        .set('Origin', origin).set('X-SDLCFlow-CSRF', '1').set('Cookie', `${name}=${credential}`);
    return { app, user, session, send };
}

describe('unmounted refresh HTTP router', () => {
    it('rotates the cookie and returns only a scoped 15-minute access token', async () => {
        const { session, send } = await setup();
        const response = await send().send({}).expect(200);
        expect(Object.keys(response.body.data).sort()).toEqual(['expiresAt', 'token']);
        const claims = jwt.verify(response.body.data.token, process.env.JWT_SECRET,
            { algorithms: ['HS256'], issuer: 'sdlcflow', audience: 'sdlcflow-api' });
        expect(claims).toMatchObject({ id: session.userId, sid: session.sessionId, sessionVersion: 4, purpose: 'access' });
        expect(claims.exp - claims.iat).toBe(900);
        expect(response.body.data.expiresAt).toBe(new Date(claims.exp * 1000).toISOString());
        expect(response.headers['set-cookie'][0]).toContain('HttpOnly; Secure; SameSite=Strict');
        expect(response.headers['set-cookie'][0]).not.toContain(session.credential);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(JSON.stringify(response.body)).not.toContain(session.credential);
    });

    it('caps access expiry at the family expiry', async () => {
        const { session, send } = await setup();
        const deadline = new Date(Date.now() + 60_000);
        await RefreshSession.updateOne({ _id: session.sessionId }, { expiresAt: deadline });
        const response = await send().send({}).expect(200);
        expect(jwt.decode(response.body.data.token).exp).toBe(Math.floor(deadline.getTime() / 1000));
    });

    it('rejects replay without emitting a cookie that could overwrite a newer login', async () => {
        const { send } = await setup();
        await send().send({}).expect(200);
        const response = await send().send({}).expect(401);
        expect(response.body.error.code).toBe('REFRESH_REUSED');
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('requires cookie credentials, not body fields or a bearer token', async () => {
        const { app, session } = await setup();
        const response = await request(app).post('/auth/refresh').set('Origin', origin)
            .set('X-SDLCFlow-CSRF', '1').set('Authorization', `Bearer ${session.credential}`)
            .send({ credential: session.credential }).expect(401);
        expect(response.body.error.code).toBe('REFRESH_INVALID');
        expect((await RefreshSession.findById(session.sessionId)).rotationCount).toBe(0);
    });

    it('logs out one family without needing an access JWT and supports repeated logout', async () => {
        const { user, session, send } = await setup();
        const other = await createRefreshSession(user);
        for (let i = 0; i < 2; i++) {
            const response = await send('logout').send({ userId: 'ignored' }).expect(200);
            expect(response.body.data.loggedOut).toBe(true);
            expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
        }
        expect((await RefreshSession.findById(session.sessionId)).revocationReason).toBe('logout');
        await send().send({}).expect(401);
        await expect(rotateRefreshSession(other.credential)).resolves.toHaveProperty('credential');
    });

    it('lets a consumed credential log out its family after a racing rotation', async () => {
        const { session, send } = await setup();
        const next = await rotateRefreshSession(session.credential);
        await send('logout').send({}).expect(200);
        await expect(rotateRefreshSession(next.credential)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
    });

    it('cannot log out a family with a guessed secret', async () => {
        const { session, send } = await setup();
        await send('logout', `${session.sessionId}.${'A'.repeat(43)}`).send({}).expect(401);
        expect((await RefreshSession.findById(session.sessionId)).revokedAt).toBeNull();
    });

    it.each(['refresh', 'logout'])('fails CSRF checks before %s can write', async (path) => {
        const { send, session } = await setup();
        await send(path).set('Origin', 'https://evil.example.com').send({}).expect(403);
        const record = await RefreshSession.findById(session.sessionId);
        expect(record.rotationCount).toBe(0);
        expect(record.revokedAt).toBeNull();
    });

    it('limits refresh before parsing and leaves a separate logout budget', async () => {
        const { send } = await setup();
        for (let i = 0; i < REFRESH_REQUEST_LIMIT; i++) await send('refresh', 'invalid').send({}).expect(401);
        const response = await send().set('Content-Type', 'application/json').send('{').expect(429);
        expect(response.body.error.code).toBe('AUTH_RATE_LIMITED');
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
        expect(response.headers['cache-control']).toBe('no-store');
        await send('logout').send({}).expect(200);
    });

    it.each(['refresh', 'logout'])('preserves cookies and reports unavailable when %s storage fails', async (path) => {
        const { send } = await setup();
        vi.spyOn(RefreshSession, path === 'refresh' ? 'findOne' : 'findOneAndUpdate')
            .mockImplementationOnce(() => { throw new Error('private database details'); });
        const response = await send(path).send({}).expect(503);
        expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
        expect(JSON.stringify(response.body)).not.toContain('private');
        expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('returns JSON for malformed and oversized bodies without rotating', async () => {
        const { send, session } = await setup();
        await send().set('Content-Type', 'application/json').send('{').expect(400);
        await send().send({ extra: 'x'.repeat(2000) }).expect(413);
        expect((await RefreshSession.findById(session.sessionId)).rotationCount).toBe(0);
    });

    it('protects mounted refresh/logout with the cookie request guard', async () => {
        await request(createApp()).post('/api/v1/auth/refresh').send({}).expect(403);
        await request(createApp()).post('/api/v1/auth/logout').send({}).expect(403);
    });
});
