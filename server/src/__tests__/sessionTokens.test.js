import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../app.js';
import User from '../models/User.js';
import { sessionVersion, createSessionToken } from '../utils/sessionTokens.js';

let mongo;
const password = 'a test passphrase';
beforeAll(async () => {
    process.env.JWT_SECRET = 'session-version-test-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => { await User.deleteMany({}); });
afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});

async function createUser(version = 0) {
    return User.create({ name: 'Test User', email: 'test@example.com',
        passwordHash: await bcrypt.hash(password, 4), sessionVersion: version });
}
const me = (app, token) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
const sign = (claims, options = {}) => jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '7d', ...options });

describe('session version foundation', () => {
    it.each([null, -1, 1.5, '0', {}, [], Number.MAX_SAFE_INTEGER + 1])('rejects invalid version %j', (value) => {
        expect(sessionVersion(value)).toBe(null);
    });

    it('treats only an absent version as legacy zero', () => {
        expect(sessionVersion(undefined)).toBe(0);
        expect(sessionVersion(0)).toBe(0);
        expect(sessionVersion(2)).toBe(2);
    });

    it('issues a version-zero token at registration and keeps internal fields out of user responses', async () => {
        const app = createApp();
        const result = await request(app).post('/api/v1/auth/register')
            .send({ name: 'Test', email: 'test@example.com', password, sessionVersion: 99 }).expect(201);
        const decoded = jwt.verify(result.body.data.token, process.env.JWT_SECRET);
        expect(decoded.sessionVersion).toBe(0);
        expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
        expect(result.body.data.user).not.toHaveProperty('sessionVersion');
        const profile = await me(app, result.body.data.token).expect(200);
        expect(profile.body.data).not.toHaveProperty('sessionVersion');
        expect((await User.findById(decoded.id)).sessionVersion).toBeUndefined();
        expect(() => createSessionToken({ _id: decoded.id })).toThrow('Session version must be selected');
    });

    it('checks the stored version on each request and login issues its current value', async () => {
        const app = createApp();
        const user = await createUser();
        const oldToken = createSessionToken(user);
        await me(app, oldToken).expect(200);
        // Simulate a future revocation action without adding one in this slice.
        await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
        const rejected = await me(app, oldToken).expect(401);
        expect(rejected.body.error.code).toBe('SESSION_INVALIDATED');
        const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
        expect(jwt.verify(login.body.data.token, process.env.JWT_SECRET).sessionVersion).toBe(1);
        expect(login.body.data.user).not.toHaveProperty('sessionVersion');
        await me(app, login.body.data.token).expect(200);
        await me(app, sign({ id: user.id, sessionVersion: 2 })).expect(401);
    });

    it('supports legacy documents and tokens only while the stored version is zero', async () => {
        const app = createApp();
        const user = await createUser();
        await User.collection.updateOne({ _id: user._id }, { $unset: { sessionVersion: '' } });
        const legacyToken = sign({ id: user.id });
        await me(app, legacyToken).expect(200);
        const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
        expect(jwt.verify(login.body.data.token, process.env.JWT_SECRET).sessionVersion).toBe(0);
        await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
        await me(app, legacyToken).expect(401);
        await me(app, login.body.data.token).expect(401);
    });

    it.each([null, -1, 0.5, '0', {}, []])('rejects signed malformed claims before user lookup: %j', async (version) => {
        const app = createApp();
        const result = await me(app, sign({ id: new mongoose.Types.ObjectId().toString(), sessionVersion: version })).expect(401);
        expect(result.body.error.code).toBe('INVALID_TOKEN');
    });

    it('rejects malformed IDs, expired/tampered tokens, and deleted accounts', async () => {
        const app = createApp();
        const user = await createUser();
        const token = createSessionToken(user);
        for (const id of [null, {}, 'invalid']) {
            const result = await me(app, sign({ id, sessionVersion: 0 })).expect(401);
            expect(result.body.error.code).toBe('INVALID_TOKEN');
        }
        await me(app, sign({ id: user.id, sessionVersion: 0 }, { expiresIn: -1 })).expect(401);
        await me(app, `${token}tampered`).expect(401);
        await User.deleteOne({ _id: user._id });
        const result = await me(app, token).expect(401);
        expect(result.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('does not let profile updates overwrite internal session state', async () => {
        const app = createApp();
        const user = await createUser(3);
        await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${createSessionToken(user)}`)
            .send({ name: 'Renamed', sessionVersion: 0 }).expect(200);
        expect((await User.findById(user._id).select('+sessionVersion')).sessionVersion).toBe(3);
    });

    it('fails closed for corrupt stored state and refuses to sign it', async () => {
        const app = createApp();
        const user = await createUser();
        const token = createSessionToken(user);
        await User.collection.updateOne({ _id: user._id }, { $set: { sessionVersion: null } });
        await me(app, token).expect(401);
        expect(() => createSessionToken({ _id: user._id, sessionVersion: null })).toThrow();
        user.sessionVersion = -1;
        await expect(user.validate()).rejects.toThrow();
    });
});
