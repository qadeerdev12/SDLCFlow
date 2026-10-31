// Exercise the HTTP boundary with real hashes and disposable MongoDB, never mail.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { issueAccess } from './helpers/auth.js';
import rawRequest from './helpers/http.js';
import { createApp } from '../app.js';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import RefreshSession from '../models/RefreshSession.js';
import { issuePasswordResetToken } from '../services/passwordResetTokenService.js';
import { createRefreshSession, rotateRefreshSession } from '../services/refreshSessionService.js';

let mongo;
const password = 'original passphrase';
const newPassword = 'replacement passphrase';
const path = '/api/v1/auth/reset-password';
beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'reset-completion-test-secret');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await PasswordResetToken.init();
}, 60_000);
afterEach(async () => {
    vi.restoreAllMocks();
    for (const model of [User, PasswordResetToken, RefreshSession]) await model.deleteMany({});
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

async function setup(version = 0) {
    const app = createApp();
    const user = await User.create({ name: 'Test', email: 'reset@example.test', sessionVersion: version,
        passwordHash: await bcrypt.hash(password, 4) });
    const { token } = await issuePasswordResetToken(user._id);
    return { app, user, token,
        reset: (body = { token, newPassword }) => request(app).post(path).send(body),
        stored: () => User.findById(user._id).select('+passwordHash +sessionVersion'),
    };
}

it('changes the password without login, invalidates old sessions, and requires a fresh login', async () => {
    const ctx = await setup(3);
    const access = await issueAccess(ctx.user);
    const family = await createRefreshSession(ctx.user);
    const result = await ctx.reset().expect(200);
    expect(result.body).toEqual({ data: { updated: true } });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    const stored = await ctx.stored();
    expect(stored.sessionVersion).toBe(4);
    expect(await stored.comparePassword(newPassword)).toBe(true);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`).expect(401);
    await expect(rotateRefreshSession(family.credential)).rejects.toMatchObject({ code: 'REFRESH_INVALID' });
    await request(ctx.app).post('/api/v1/auth/login').send({ email: ctx.user.email, password }).expect(401);
    await request(ctx.app).post('/api/v1/auth/login').send({ email: ctx.user.email, password: newPassword }).expect(200);
    await ctx.reset().expect(400);
});

// Password validation precedes token consumption, allowing correction and retry.
it.each(['short', 'x'.repeat(73), { $ne: null }])('preserves the link on invalid password %j', async (value) => {
    const ctx = await setup();
    await ctx.reset({ token: ctx.token, newPassword: value }).expect(400);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    expect((await ctx.stored()).passwordHash).toBe(ctx.user.passwordHash);
    await ctx.reset().expect(200);
});

it.each(['expired', 'wrong', 'malformed', 'deleted', 'revoked'])('rejects %s claims before hashing', async (kind) => {
    const ctx = await setup();
    let token = ctx.token;
    if (kind === 'expired') await PasswordResetToken.updateOne({}, { expiresAt: new Date(0) });
    if (kind === 'wrong') token = 'b'.repeat(64);
    if (kind === 'malformed') token = { $ne: null };
    if (kind === 'deleted') await User.deleteMany({});
    if (kind === 'revoked') await User.updateOne({}, { $inc: { sessionVersion: 1 } });
    const hash = vi.spyOn(bcrypt, 'hash');
    const response = await ctx.reset({ token, newPassword }).expect(400);
    expect(response.body.error.code).toBe('PASSWORD_RESET_INVALID');
    expect(hash).not.toHaveBeenCalled();
});

it('allows only one concurrent use of a token to change the password', async () => {
    const ctx = await setup();
    const results = await Promise.all([ctx.reset(), ctx.reset()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await ctx.stored()).sessionVersion).toBe(1);
});

// Hold the first reset after claiming, then issue/claim another token against the
// same generation. Both reach the write, but the account CAS permits only one.
it('allows only one overlapping reset with different tokens to commit', async () => {
    const ctx = await setup();
    const originalHash = bcrypt.hash.bind(bcrypt);
    let firstArrived, release;
    const arrived = new Promise((resolve) => { firstArrived = resolve; });
    const barrier = new Promise((resolve) => { release = resolve; });
    let count = 0;
    vi.spyOn(bcrypt, 'hash').mockImplementation(async (...args) => {
        if (++count === 1) firstArrived();
        else release();
        await barrier;
        return originalHash(...args);
    });
    const first = ctx.reset().then((response) => response);
    await arrived;
    const second = await issuePasswordResetToken(ctx.user._id);
    const alternatives = [newPassword, 'another replacement passphrase'];
    const results = await Promise.all([first, ctx.reset({ token: second.token, newPassword: alternatives[1] })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await ctx.stored();
    expect(stored.sessionVersion).toBe(1);
    expect(await stored.comparePassword(alternatives[results.findIndex((r) => r.status === 200)])).toBe(true);
});

it.each(['revocation', 'password change', 'deletion'])('does not overwrite a racing %s', async (kind) => {
    const ctx = await setup();
    const originalUpdate = User.findOneAndUpdate.bind(User);
    vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
        if (kind === 'deletion') await User.deleteOne({ _id: ctx.user._id });
        else await User.updateOne({ _id: ctx.user._id }, {
            $inc: { sessionVersion: 1 }, ...(kind === 'password change' ? { $set: { passwordHash: 'concurrent-hash' } } : {}),
        });
        return originalUpdate(...args);
    });
    await ctx.reset().expect(409);
    const stored = await ctx.stored();
    if (kind === 'deletion') expect(stored).toBeNull();
    else {
        expect(stored.sessionVersion).toBe(1);
        expect(stored.passwordHash).toBe(kind === 'password change' ? 'concurrent-hash' : ctx.user.passwordHash);
    }
});

it('supports legacy documents and rejects counter overflow', async () => {
    const ctx = await setup();
    await User.collection.updateOne({ _id: ctx.user._id }, { $unset: { sessionVersion: '' } });
    await ctx.reset().expect(200);
    expect((await ctx.stored()).sessionVersion).toBe(1);
    await User.updateOne({}, { sessionVersion: Number.MAX_SAFE_INTEGER });
    const issued = await issuePasswordResetToken(ctx.user._id);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await ctx.reset({ token: issued.token, newPassword }).expect(500);
    expect((await ctx.stored()).sessionVersion).toBe(Number.MAX_SAFE_INTEGER);
});

it('burns a claimed token on write failure without changing credentials or logging secrets', async () => {
    const ctx = await setup();
    vi.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error(ctx.token));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await ctx.reset().expect(500);
    expect(JSON.stringify([result.body, log.mock.calls])).not.toContain(ctx.token);
    expect((await ctx.stored()).passwordHash).toBe(ctx.user.passwordHash);
    expect((await ctx.stored()).sessionVersion).toBe(0);
    await ctx.reset().expect(400);
});

// Browser and parser policy must reject requests before consuming any token.
it('rejects GET, missing origin, malformed JSON and oversized bodies without consuming', async () => {
    const ctx = await setup();
    await request(ctx.app).get(path).expect(404);
    await rawRequest(ctx.app).post(path).send({ token: ctx.token, newPassword }).expect(403);
    await request(ctx.app).post(path).send('{').expect(400);
    await ctx.reset({ token: ctx.token, newPassword, padding: 'x'.repeat(5000) }).expect(413);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
});

it('throttles before parsing or consuming and keeps login on a separate budget', async () => {
    const ctx = await setup();
    for (let i = 0; i < 10; i++) await ctx.reset({ token: 'bad', newPassword }).expect(400);
    const limited = await request(ctx.app).post(path).send('{').expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.body.error.message).toContain('password-reset');
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    await request(ctx.app).post('/api/v1/auth/login').send({ email: ctx.user.email, password }).expect(200);
});
