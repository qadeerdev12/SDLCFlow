// Real disposable MongoDB verifies atomic claims, unique indexes and TTL metadata.
// No HTTP routes, private .env files, real accounts, or email providers are used.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { issuePasswordResetToken, consumePasswordResetToken, PASSWORD_RESET_LIFETIME_MS } from '../services/passwordResetTokenService.js';

let mongo, user;
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await PasswordResetToken.init();
}, 60_000);
beforeEach(async () => {
    user = await User.create({ name: 'Reset Test', email: 'reset@example.test', passwordHash: 'unchanged', sessionVersion: 3 });
});
afterEach(async () => {
    vi.restoreAllMocks();
    await PasswordResetToken.deleteMany({});
    await User.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('persists only a digest and fixes a short lifetime without changing credentials', async () => {
    const before = Date.now();
    const issued = await issuePasswordResetToken(user._id);
    expect(issued.token).toMatch(/^[a-f0-9]{64}$/);
    const stored = await PasswordResetToken.findOne().lean();
    expect(stored.tokenDigest).toBe(createHash('sha256').update(issued.token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(stored.sessionVersion).toBe(3);
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(before + PASSWORD_RESET_LIFETIME_MS);
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + PASSWORD_RESET_LIFETIME_MS);
    const account = await User.findById(user._id).select('+passwordHash +sessionVersion');
    expect(account.passwordHash).toBe('unchanged');
    expect(account.sessionVersion).toBe(3);
});

// Re-requesting is bounded to one row and makes previously emailed links useless.
it('replaces an older token and allows the replacement only once', async () => {
    const old = await issuePasswordResetToken(user._id);
    const current = await issuePasswordResetToken(user._id);
    expect(current.token).not.toBe(old.token);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    expect(await consumePasswordResetToken(old.token)).toBeNull();
    const claim = await consumePasswordResetToken(current.token);
    expect(String(claim.userId)).toBe(String(user._id));
    expect(claim.sessionVersion).toBe(3);
    expect(await consumePasswordResetToken(current.token)).toBeNull();
});

it('allows exactly one of several simultaneous claims', async () => {
    const { token } = await issuePasswordResetToken(user._id);
    const results = await Promise.all(Array.from({ length: 5 }, () => consumePasswordResetToken(token)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await PasswordResetToken.countDocuments()).toBe(0);
});

it('keeps concurrent requests bounded to one pending token', async () => {
    const issued = await Promise.all(Array.from({ length: 4 }, () => issuePasswordResetToken(user._id)));
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    const claims = await Promise.all(issued.map(({ token }) => consumePasswordResetToken(token)));
    expect(claims.filter(Boolean)).toHaveLength(1);
});

// A bearer secret must resolve only to its stored account, never a caller's ID.
it('keeps different accounts independent', async () => {
    const other = await User.create({ name: 'Other', email: 'other@example.test', passwordHash: 'unchanged' });
    const first = await issuePasswordResetToken(user._id);
    const second = await issuePasswordResetToken(other._id);
    expect(String((await consumePasswordResetToken(first.token)).userId)).toBe(String(user._id));
    expect(String((await consumePasswordResetToken(second.token)).userId)).toBe(String(other._id));
});

// Freeze only Date, not Mongo timers, to test the exact expiry boundary
// without waiting for asynchronous TTL cleanup or depending on wall-clock timing.
it.each([0, -1])('rejects an expired row still present in storage (offset %i)', async (offset) => {
    const { token } = await issuePasswordResetToken(user._id);
    const now = new Date();
    await PasswordResetToken.updateOne({}, { expiresAt: new Date(now.getTime() + offset) });
    // A fixed Date constructor makes the query boundary deterministic.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
        expect(await consumePasswordResetToken(token)).toBeNull();
    } finally { vi.useRealTimers(); }
});

it.each([undefined, null, '', 'bad', ['a'.repeat(64)], { $ne: null }].map((token) => ({ token })))('rejects malformed input without querying storage: %j', async ({ token }) => {
    const query = vi.spyOn(PasswordResetToken, 'findOneAndDelete');
    expect(await consumePasswordResetToken(token)).toBeNull();
    expect(query).not.toHaveBeenCalled();
});

it('does not consume a valid token when given an unrelated well-formed secret', async () => {
    const { token } = await issuePasswordResetToken(user._id);
    expect(await consumePasswordResetToken('a'.repeat(64))).toBeNull();
    expect(await consumePasswordResetToken(token)).not.toBeNull();
});

// Tokens carry the account generation, so later revocation wins over old mail.
it.each(['revoked', 'deleted'])('rejects a token for a %s account', async (kind) => {
    const { token } = await issuePasswordResetToken(user._id);
    if (kind === 'revoked') await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    else await User.deleteOne({ _id: user._id });
    expect(await consumePasswordResetToken(token)).toBeNull();
});

it('supports legacy accounts without a stored sessionVersion', async () => {
    await User.collection.updateOne({ _id: user._id }, { $unset: { sessionVersion: '' } });
    const { token } = await issuePasswordResetToken(user._id);
    expect((await consumePasswordResetToken(token)).sessionVersion).toBe(0);
});

it('does not issue tokens for missing or malformed user IDs', async () => {
    expect(await issuePasswordResetToken(new mongoose.Types.ObjectId())).toBeNull();
    expect(await issuePasswordResetToken({ $ne: null })).toBeNull();
    expect(await PasswordResetToken.countDocuments()).toBe(0);
});

// Persistence failures must propagate, never yield a secret or a successful claim.
it('fails closed when storing or consuming a token fails', async () => {
    vi.spyOn(PasswordResetToken, 'findOneAndUpdate').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(issuePasswordResetToken(user._id)).rejects.toThrow('storage unavailable');
    vi.spyOn(PasswordResetToken, 'findOneAndDelete').mockImplementationOnce(() => { throw new Error('storage unavailable'); });
    await expect(consumePasswordResetToken('a'.repeat(64))).rejects.toThrow('storage unavailable');
});

it('creates unique account/digest indexes and an expiry cleanup index', async () => {
    const indexes = await PasswordResetToken.collection.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: { user: 1 }, unique: true }),
        expect.objectContaining({ key: { tokenDigest: 1 }, unique: true }),
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
});
