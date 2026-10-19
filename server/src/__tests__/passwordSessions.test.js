import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../app.js';
import User from '../models/User.js';
import { createSessionToken } from '../utils/sessionTokens.js';

let mongo;
const password = 'original passphrase';
const newPassword = 'replacement passphrase';
beforeAll(async () => {
    process.env.JWT_SECRET = 'password-sessions-test-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => { vi.restoreAllMocks(); await User.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function setup(version = 0) {
    const app = createApp();
    const user = await User.create({ name: 'Test', email: 'test@example.com', sessionVersion: version,
        passwordHash: await bcrypt.hash(password, 4) });
    const token = createSessionToken(user);
    return {
        app, user, token,
        change: (body = { currentPassword: password, newPassword }, auth = token) => request(app)
            .patch('/api/v1/auth/password').set('Authorization', `Bearer ${auth}`).send(body),
        me: (auth = token) => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${auth}`),
        stored: () => User.findById(user._id).select('+passwordHash +sessionVersion'),
    };
}

describe('password change session revocation', () => {
    it('replaces the hash and increments once, invalidating all old REST tokens', async () => {
        const ctx = await setup(4);
        const otherToken = jwt.sign({ id: ctx.user.id, sessionVersion: 4, iat: 1 }, process.env.JWT_SECRET);
        const result = await ctx.change().expect(200);
        expect(result.body).toEqual({ data: { updated: true } });
        const stored = await ctx.stored();
        expect(stored.sessionVersion).toBe(5);
        expect(await stored.comparePassword(newPassword)).toBe(true);
        for (const token of [ctx.token, otherToken]) {
            const rejected = await ctx.me(token).expect(401);
            expect(rejected.body.error.code).toBe('SESSION_INVALIDATED');
        }
        await request(ctx.app).post('/api/v1/auth/login').send({ email: ctx.user.email, password }).expect(401);
        const login = await request(ctx.app).post('/api/v1/auth/login')
            .send({ email: ctx.user.email, password: newPassword }).expect(200);
        expect(jwt.verify(login.body.data.token, process.env.JWT_SECRET).sessionVersion).toBe(5);
        await ctx.me(login.body.data.token).expect(200);
    });

    it('revokes legacy tokens and creates the missing counter atomically', async () => {
        const ctx = await setup();
        await User.collection.updateOne({ _id: ctx.user._id }, { $unset: { sessionVersion: '' } });
        const legacy = jwt.sign({ id: ctx.user.id }, process.env.JWT_SECRET);
        await ctx.change({ currentPassword: password, newPassword }, legacy).expect(200);
        expect((await ctx.stored()).sessionVersion).toBe(1);
        await ctx.me(legacy).expect(401);
        await ctx.me().expect(401);
    });

    it.each([
        [{ currentPassword: 'wrong', newPassword }, 401],
        [{ currentPassword: password, newPassword: 'short' }, 400],
    ])('does not change the hash or revoke sessions on rejected input', async (body, status) => {
        const ctx = await setup();
        await ctx.change(body).expect(status);
        const stored = await ctx.stored();
        expect(stored.passwordHash).toBe(ctx.user.passwordHash);
        expect(stored.sessionVersion).toBe(0);
        await ctx.me().expect(200);
    });

    it('keeps credentials and sessions unchanged when the database write fails', async () => {
        const ctx = await setup();
        vi.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Write failed'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await ctx.change().expect(500);
        const stored = await ctx.stored();
        expect(stored.passwordHash).toBe(ctx.user.passwordHash);
        expect(stored.sessionVersion).toBe(0);
        await ctx.me().expect(200);
    });

    it('allows only one overlapping password change to commit', async () => {
        const ctx = await setup();
        const originalCompare = User.prototype.comparePassword;
        let arrivals = 0;
        let release;
        const barrier = new Promise((resolve) => { release = resolve; });
        // Both requests must verify the same snapshot before either can write.
        vi.spyOn(User.prototype, 'comparePassword').mockImplementation(async function (candidate) {
            const result = await originalCompare.call(this, candidate);
            if (++arrivals === 2) release();
            await barrier;
            return result;
        });
        const alternatives = [newPassword, 'another replacement passphrase'];
        const results = await Promise.all(alternatives.map((value) => ctx.change({ currentPassword: password, newPassword: value })));
        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
        expect(results.find((result) => result.status === 409).body.error.code).toBe('PASSWORD_CHANGE_CONFLICT');
        const stored = await ctx.stored();
        expect(stored.sessionVersion).toBe(1);
        expect(await bcrypt.compare(alternatives[results.findIndex((result) => result.status === 200)], stored.passwordHash)).toBe(true);
    });

    it('does not overwrite a revocation that occurs while a password change is in flight', async () => {
        const ctx = await setup();
        const originalUpdate = User.findOneAndUpdate.bind(User);
        vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
            await User.updateOne({ _id: ctx.user._id }, { $inc: { sessionVersion: 1 } });
            return originalUpdate(...args);
        });
        await ctx.change().expect(409);
        const stored = await ctx.stored();
        expect(stored.passwordHash).toBe(ctx.user.passwordHash);
        expect(stored.sessionVersion).toBe(1);
    });
});
