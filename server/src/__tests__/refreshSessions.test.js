import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import RefreshSession, { MAX_REFRESH_ROTATIONS, REFRESH_LIFETIME_MS } from '../models/RefreshSession.js';
import User from '../models/User.js';
import { createRefreshSession, rotateRefreshSession } from '../services/refreshSessionService.js';

let mongo;
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => {
    vi.restoreAllMocks();
    await RefreshSession.deleteMany({});
    await User.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function setup() {
    const user = await User.create({ name: 'Test', email: 'refresh@example.com', passwordHash: 'unused', sessionVersion: 3 });
    return { user, session: await createRefreshSession(user) };
}
const stored = (session) => RefreshSession.findById(session.sessionId).select('+currentDigest +consumedDigests').lean();

describe('refresh-session foundation (not yet connected to HTTP)', () => {
    it('stores only digests, hides them by default and sets an absolute seven-day lifetime', async () => {
        const start = Date.now();
        const { session } = await setup();
        expect(session.credential).toMatch(/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/);
        expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(start + REFRESH_LIFETIME_MS);
        const record = await stored(session);
        expect(record.currentDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(record)).not.toContain(session.credential.split('.')[1]);
        expect(record.consumedDigests).toEqual([]);
        const publicRecord = await RefreshSession.findById(session.sessionId).lean();
        expect(publicRecord.currentDigest).toBeUndefined();
        expect(publicRecord.consumedDigests).toBeUndefined();
        expect(RefreshSession.schema.indexes()).toContainEqual([{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
    });

    it.each([undefined, null, -1, 1.5])('rejects issuance with invalid/unselected version %s', async (version) => {
        await expect(createRefreshSession({ _id: new mongoose.Types.ObjectId(), sessionVersion: version })).rejects.toThrow();
        expect(await RefreshSession.countDocuments()).toBe(0);
    });

    it('rotates once, retains account version and never extends expiry', async () => {
        const { session } = await setup();
        const before = await stored(session);
        const next = await rotateRefreshSession(session.credential);
        expect(next.credential).not.toBe(session.credential);
        expect(next).toMatchObject({ sessionId: session.sessionId, sessionVersion: 3, expiresAt: session.expiresAt });
        const after = await stored(session);
        expect(after.consumedDigests).toEqual([before.currentDigest]);
        expect(after.rotationCount).toBe(1);
        expect(after.lastRefreshedAt).toBeInstanceOf(Date);
    });

    it('revokes the family on an old-token replay without affecting another family', async () => {
        const { user, session } = await setup();
        const other = await createRefreshSession(user);
        const next = await rotateRefreshSession(session.credential);
        await expect(rotateRefreshSession(session.credential)).rejects.toMatchObject({ code: 'REFRESH_REUSED', sessionId: session.sessionId });
        await expect(rotateRefreshSession(next.credential)).rejects.toMatchObject({ code: 'REFRESH_INVALID' });
        await expect(rotateRefreshSession(other.credential)).resolves.toHaveProperty('credential');
    });

    it('allows only one concurrent rotation and revokes the winning credential on replay', async () => {
        const { session } = await setup();
        const results = await Promise.allSettled([rotateRefreshSession(session.credential), rotateRefreshSession(session.credential)]);
        expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.find((item) => item.status === 'rejected').reason.code).toBe('REFRESH_REUSED');
        expect((await stored(session)).rotationCount).toBe(1);
        await expect(rotateRefreshSession(results.find((item) => item.status === 'fulfilled').value.credential))
            .rejects.toHaveProperty('code', 'REFRESH_INVALID');
    });

    it('does not revoke for a guessed secret with a known selector', async () => {
        const { session } = await setup();
        await expect(rotateRefreshSession(`${session.sessionId}.${'A'.repeat(43)}`)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
        expect((await stored(session)).revokedAt).toBeNull();
        await expect(rotateRefreshSession(session.credential)).resolves.toHaveProperty('credential');
    });

    it('detects replay from multiple rotations ago', async () => {
        const { session } = await setup();
        const second = await rotateRefreshSession(session.credential);
        const third = await rotateRefreshSession(second.credential);
        await expect(rotateRefreshSession(session.credential)).rejects.toHaveProperty('code', 'REFRESH_REUSED');
        await expect(rotateRefreshSession(third.credential)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
        expect((await stored(session)).consumedDigests).toHaveLength(2);
    });

    it('never upgrades the version when logout-all races a rotation', async () => {
        const { user, session } = await setup();
        const original = RefreshSession.findOneAndUpdate.bind(RefreshSession);
        vi.spyOn(RefreshSession, 'findOneAndUpdate').mockImplementationOnce((...args) => ({
            lean: async () => {
                await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
                return original(...args).lean();
            },
        }));
        const next = await rotateRefreshSession(session.credential);
        expect(next.sessionVersion).toBe(3);
        expect((await stored(session)).sessionVersion).toBe(3);
        await expect(rotateRefreshSession(next.credential)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
    });

    it('cannot overwrite a concurrent family revocation', async () => {
        const { session } = await setup();
        const original = RefreshSession.findOneAndUpdate.bind(RefreshSession);
        vi.spyOn(RefreshSession, 'findOneAndUpdate').mockImplementationOnce((...args) => ({
            lean: async () => {
                await RefreshSession.updateOne({ _id: session.sessionId }, { revokedAt: new Date() });
                return original(...args).lean();
            },
        }));
        await expect(rotateRefreshSession(session.credential)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
        expect((await stored(session)).rotationCount).toBe(0);
    });

    it.each([null, {}, '', 'bad', 'x'.repeat(10000)])('rejects malformed input without database access', async (input) => {
        const query = vi.spyOn(RefreshSession, 'findOne');
        await expect(rotateRefreshSession(input)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
        expect(query).not.toHaveBeenCalled();
    });

    it.each(['expired', 'revoked', 'deleted-user', 'version-changed'])('rejects %s sessions without rotation', async (state) => {
        const { user, session } = await setup();
        if (state === 'expired') await RefreshSession.updateOne({ _id: session.sessionId }, { expiresAt: new Date(0) });
        if (state === 'revoked') await RefreshSession.updateOne({ _id: session.sessionId }, { revokedAt: new Date() });
        if (state === 'deleted-user') await User.deleteOne({ _id: user._id });
        if (state === 'version-changed') await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
        await expect(rotateRefreshSession(session.credential)).rejects.toHaveProperty('code', 'REFRESH_INVALID');
        expect((await stored(session))?.rotationCount ?? 0).toBe(0);
    });

    it('fails closed at the rotation cap without discarding replay history', async () => {
        const { session } = await setup();
        await RefreshSession.updateOne({ _id: session.sessionId }, { rotationCount: MAX_REFRESH_ROTATIONS });
        await expect(rotateRefreshSession(session.credential)).rejects.toHaveProperty('code', 'REFRESH_EXHAUSTED');
        expect((await stored(session)).revocationReason).toBe('rotation_limit');
    });

    it('propagates database outages without returning a credential or consuming the old one', async () => {
        const { session } = await setup();
        vi.spyOn(RefreshSession, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('database unavailable'); });
        await expect(rotateRefreshSession(session.credential)).rejects.toThrow('database unavailable');
        expect((await stored(session)).rotationCount).toBe(0);
        await expect(rotateRefreshSession(session.credential)).resolves.toHaveProperty('credential');
    });
});
