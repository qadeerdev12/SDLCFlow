// Real disposable MongoDB covers one-time claims and address-change races.
// No verification endpoint or mail provider exists in this foundation slice.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import RefreshSession from '../models/RefreshSession.js';
import { issueEmailVerificationToken, completeEmailVerification, EMAIL_VERIFICATION_LIFETIME_MS } from '../services/emailVerificationService.js';
import { issuePasswordResetToken, consumePasswordResetToken } from '../services/passwordResetTokenService.js';
import { createApp } from '../app.js';
import request, { issueAccess } from './helpers/auth.js';

let mongo, user, app, access;
const stored = () => User.findById(user._id).select('+emailVerifiedAt +emailVerificationVersion +sessionVersion +passwordHash').lean();
const issue = () => issueEmailVerificationToken(user._id);
const profile = (body) => request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`).send(body);
beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'email-verification-test-secret');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), EmailVerificationToken.init(), PasswordResetToken.init()]);
}, 60_000);
beforeEach(async () => {
    app = createApp();
    user = await User.create({ name: 'Test', email: 'owner@example.test', passwordHash: 'unchanged' });
    access = await issueAccess(user);
});
afterEach(async () => {
    vi.restoreAllMocks();
    for (const model of [EmailVerificationToken, PasswordResetToken, RefreshSession, User]) await model.deleteMany({});
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

it('starts unverified, hides internal state, and keeps authenticated access unchanged', async () => {
    const account = await stored();
    expect(account.emailVerifiedAt).toBeNull();
    expect(account.emailVerificationVersion).toBe(0);
    const ordinary = await User.findById(user._id).lean();
    expect(ordinary).not.toHaveProperty('emailVerifiedAt');
    expect(ordinary).not.toHaveProperty('emailVerificationVersion');
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`).expect(200);
    expect(me.body.data).not.toHaveProperty('emailVerifiedAt');
});

it('stores only a random-token digest bound to the current address and generations', async () => {
    const start = Date.now();
    const issued = await issue();
    const row = await EmailVerificationToken.findOne().lean();
    expect(issued.token).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.email).toBe(user.email);
    expect(row.tokenDigest).toBe(createHash('sha256').update(issued.token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(issued.token);
    expect(row.email).toBe(user.email);
    expect(row.emailVerificationVersion).toBe(0);
    expect(row.sessionVersion).toBe(0);
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(start + EMAIL_VERIFICATION_LIFETIME_MS);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + EMAIL_VERIFICATION_LIFETIME_MS);
    expect((await stored()).emailVerifiedAt).toBeNull();
});

it('verifies once without changing credentials or minting/revoking a session', async () => {
    const { token } = await issue();
    const result = await completeEmailVerification(token);
    expect(String(result.userId)).toBe(String(user._id));
    expect(result.emailVerifiedAt).toBeInstanceOf(Date);
    const account = await stored();
    expect(account.emailVerifiedAt).toEqual(result.emailVerifiedAt);
    expect(account.passwordHash).toBe('unchanged');
    expect(account.sessionVersion).toBe(0);
    expect(await completeEmailVerification(token)).toBeNull();
    expect(await issue()).toBeNull();
    expect(await RefreshSession.countDocuments()).toBe(1);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`).expect(200);
});

// A resend supersedes the old link, while atomic deletion handles simultaneous clicks.
it('replaces old tokens and permits only one simultaneous completion', async () => {
    const old = await issue(), current = await issue();
    expect(current.token).not.toBe(old.token);
    expect(await EmailVerificationToken.countDocuments()).toBe(1);
    expect(await completeEmailVerification(old.token)).toBeNull();
    const results = await Promise.all(Array.from({ length: 5 }, () => completeEmailVerification(current.token)));
    expect(results.filter(Boolean)).toHaveLength(1);
});

it('bounds concurrent issuance to a single pending link', async () => {
    const issued = await Promise.all(Array.from({ length: 4 }, issue));
    expect(await EmailVerificationToken.countDocuments()).toBe(1);
    const results = await Promise.all(issued.map(({ token }) => completeEmailVerification(token)));
    expect(results.filter(Boolean)).toHaveLength(1);
});

it.each([0, -1])('rejects expiry at offset %i without depending on TTL deletion', async (offset) => {
    const { token } = await issue();
    const now = new Date();
    await EmailVerificationToken.updateOne({}, { expiresAt: new Date(now.getTime() + offset) });
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    try { expect(await completeEmailVerification(token)).toBeNull(); }
    finally { vi.useRealTimers(); }
    expect((await stored()).emailVerifiedAt).toBeNull();
});

it.each([undefined, null, '', 'bad', ['a'.repeat(64)], { $ne: null }].map((token) => ({ token })))(
    'rejects malformed token %j before database access', async ({ token }) => {
        const lookup = vi.spyOn(EmailVerificationToken, 'findOneAndDelete');
        expect(await completeEmailVerification(token)).toBeNull();
        expect(lookup).not.toHaveBeenCalled();
    },
);

it('does not consume the genuine link when given a wrong secret', async () => {
    const { token } = await issue();
    expect(await completeEmailVerification('b'.repeat(64))).toBeNull();
    expect(await completeEmailVerification(token)).not.toBeNull();
});

it.each(['deleted', 'revoked'])('rejects a link for a %s account', async (kind) => {
    const { token } = await issue();
    if (kind === 'deleted') await User.deleteOne({ _id: user._id });
    else await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    expect(await completeEmailVerification(token)).toBeNull();
});

// Changing back to an old address must NOT revive proof issued before the change.
it('rejects old links after A -> B -> A and accepts a fresh link for A', async () => {
    const old = await issue();
    await profile({ email: 'second@example.test' }).expect(200);
    await profile({ email: user.email }).expect(200);
    expect((await stored()).emailVerificationVersion).toBe(2);
    expect(await completeEmailVerification(old.token)).toBeNull();
    const fresh = await issue();
    expect(await completeEmailVerification(fresh.token)).not.toBeNull();
});

it('clears proof on email change but preserves it for name-only and normalized same-email edits', async () => {
    const { token } = await issue();
    await completeEmailVerification(token);
    const verified = (await stored()).emailVerifiedAt;
    await profile({ name: 'Renamed' }).expect(200);
    await profile({ email: ' OWNER@EXAMPLE.TEST ' }).expect(200);
    expect((await stored()).emailVerifiedAt).toEqual(verified);
    expect((await stored()).emailVerificationVersion).toBe(0);
    await profile({ email: 'second@example.test' }).expect(200);
    expect((await stored()).emailVerifiedAt).toBeNull();
    expect((await stored()).emailVerificationVersion).toBe(1);
    expect((await stored()).sessionVersion).toBe(0);
});

it('does not let clients forge verification fields through signup or profile', async () => {
    const forged = { emailVerifiedAt: new Date().toISOString(), emailVerificationVersion: 100 };
    await profile({ name: 'Renamed', ...forged }).expect(200);
    expect((await stored()).emailVerifiedAt).toBeNull();
    const registered = await request(app).post('/api/v1/auth/register').send({
        name: 'New', email: 'new@example.test', password: 'long test passphrase', ...forged,
    }).expect(201);
    const account = await User.findById(registered.body.data.user.id).select('+emailVerifiedAt +emailVerificationVersion');
    expect(account.emailVerifiedAt).toBeNull();
    expect(account.emailVerificationVersion).toBe(0);
});

it('keeps verification and password-reset token purposes separate', async () => {
    const verification = await issue(), reset = await issuePasswordResetToken(user._id);
    expect(await completeEmailVerification(reset.token)).toBeNull();
    expect(await consumePasswordResetToken(verification.token)).toBeNull();
    expect(await completeEmailVerification(verification.token)).not.toBeNull();
    expect(await consumePasswordResetToken(reset.token)).not.toBeNull();
});

it('handles legacy missing fields without marking accounts verified automatically', async () => {
    await User.collection.updateOne({ _id: user._id }, { $unset: {
        emailVerifiedAt: '', emailVerificationVersion: '', sessionVersion: '',
    } });
    const issued = await issue();
    expect((await stored()).emailVerifiedAt).toBeUndefined();
    expect(await completeEmailVerification(issued.token)).not.toBeNull();
    await profile({ email: 'second@example.test' }).expect(200);
    expect((await stored()).emailVerificationVersion).toBe(1);
    expect((await stored()).emailVerifiedAt).toBeNull();
});

// Inject a write between claim and final CAS, proving the protection is atomic
// rather than a separate read that could pass against stale account data.
it.each(['email change', 'revocation'])('rejects a racing %s after token consumption', async (kind) => {
    const { token } = await issue();
    const original = User.findOneAndUpdate.bind(User);
    vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce((...args) => ({ select: async () => {
        await User.updateOne({ _id: user._id }, kind === 'email change'
            ? { $set: { email: 'changed@example.test' }, $inc: { emailVerificationVersion: 1 } }
            : { $inc: { sessionVersion: 1 } });
        return original(...args).select('_id');
    } }));
    expect(await completeEmailVerification(token)).toBeNull();
    expect((await stored()).emailVerifiedAt).toBeNull();
});

it('rejects a racing profile email write instead of resetting the newer email generation', async () => {
    const original = User.findOneAndUpdate.bind(User);
    vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
        await User.updateOne({ _id: user._id }, { $set: { email: 'winner@example.test' }, $inc: { emailVerificationVersion: 1 } });
        return original(...args);
    });
    const result = await profile({ email: 'loser@example.test' }).expect(409);
    expect(result.body.error.code).toBe('PROFILE_CHANGE_CONFLICT');
    expect((await stored()).email).toBe('winner@example.test');
    expect((await stored()).emailVerificationVersion).toBe(1);
});

it('fails closed on persistence failure and keeps a claimed link spent', async () => {
    vi.spyOn(EmailVerificationToken, 'findOneAndUpdate').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(issue()).rejects.toThrow('storage unavailable');
    const { token } = await issue();
    vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    await expect(completeEmailVerification(token)).rejects.toThrow('storage unavailable');
    expect(await completeEmailVerification(token)).toBeNull();
    expect((await stored()).emailVerifiedAt).toBeNull();
});

it('rejects missing users and ensures unique/TTL indexes exist', async () => {
    expect(await issueEmailVerificationToken(new mongoose.Types.ObjectId())).toBeNull();
    expect(await issueEmailVerificationToken({ $ne: null })).toBeNull();
    const indexes = await EmailVerificationToken.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: { user: 1 }, unique: true }),
        expect.objectContaining({ key: { tokenDigest: 1 }, unique: true }),
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
});

it('preserves verified state when a duplicate email update is rejected', async () => {
    const { token } = await issue();
    await completeEmailVerification(token);
    const before = await stored();
    await User.create({ name: 'Other', email: 'taken@example.test', passwordHash: 'unused' });
    await profile({ email: 'taken@example.test' }).expect(409);
    const after = await stored();
    expect(after.emailVerifiedAt).toEqual(before.emailVerifiedAt);
    expect(after.emailVerificationVersion).toBe(before.emailVerificationVersion);
    expect(after.email).toBe(before.email);
});

it('fails closed on malformed stored generations and prevents counter overflow', async () => {
    await User.collection.updateOne({ _id: user._id }, { $set: { emailVerificationVersion: null } });
    await expect(issue()).rejects.toThrow('Invalid verification generation');
    await User.updateOne({ _id: user._id }, { emailVerificationVersion: Number.MAX_SAFE_INTEGER });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await profile({ email: 'changed@example.test' }).expect(500);
    expect((await stored()).email).toBe(user.email);
    expect((await stored()).emailVerificationVersion).toBe(Number.MAX_SAFE_INTEGER);
});
