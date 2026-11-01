// Real authentication and disposable storage; no provider requests or emails.
// Invalid resource IDs deliberately prove verification runs before controllers.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { issueAccess } from './helpers/auth.js';
import { createApp } from '../app.js';
import { emailVerificationRequired } from '../config/emailVerificationPolicy.js';
import User from '../models/User.js';
import RefreshSession from '../models/RefreshSession.js';

let mongo, app, user, token;
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 60000);
beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', 'verification-access-test-secret');
    vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', 'true');
    vi.stubEnv('EMAIL_VERIFICATION_ENABLED', 'false');
    app = createApp();
    user = await User.create({ name: 'Test', email: 'test@example.test', passwordHash: 'unused' });
    token = await issueAccess(user);
});
afterEach(async () => {
    await RefreshSession.deleteMany({}); await User.deleteMany({});
    vi.restoreAllMocks(); vi.unstubAllEnvs();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const routes = [
    ['get', '/boards'], ['post', '/boards'], ['get', '/boards/x'], ['patch', '/boards/x'], ['delete', '/boards/x'],
    ['get', '/boards/x/members'], ['post', '/boards/x/members'], ['patch', '/boards/x/members/y'], ['delete', '/boards/x/members/y'],
    ['get', '/boards/x/activities'], ['get', '/boards/x/workflows'], ['post', '/boards/x/workflows'],
    ['post', '/boards/x/lists'], ['patch', '/boards/x/lists/y'], ['delete', '/boards/x/lists/y'],
    ['post', '/boards/x/cards'], ['patch', '/boards/x/cards/y'], ['delete', '/boards/x/cards/y'],
    ['get', '/boards/x/cards/y/comments'], ['post', '/boards/x/cards/y/comments'],
    ['get', '/boards/x/messages'], ['post', '/boards/x/messages'], ['delete', '/boards/x/messages'], ['delete', '/boards/x/messages/y'],
    ['post', '/boards/x/summary'], ['post', '/boards/x/cards/y/draft'],
    ['get', '/boards/x/integrations/github'], ['put', '/boards/x/integrations/github'], ['delete', '/boards/x/integrations/github'],
    ['get', '/boards/x/github/commits'], ['get', '/boards/x/github/stats'],
    ['get', '/workflow-templates'], ['get', '/board-templates'], ['get', '/tasks/mine'], ['get', '/activities'],
    ['get', '/notifications'], ['patch', '/notifications/read-all'], ['patch', '/notifications/x/read'],
    ['get', '/integrations/github/start'], ['get', '/integrations/github/account'], ['delete', '/integrations/github/account'],
    ['get', '/integrations/github/dashboard'], ['get', '/integrations/github/repos'],
];
it.each(routes)('blocks unverified %s %s before resource work', async (method, path) => {
    const response = await request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`)
        .send({ emailVerified: true }).expect(403);
    expect(response.body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(response.headers['set-cookie']).toBeUndefined();
});

it('keeps authentication ahead of verification and rejects revoked sessions', async () => {
    await request(app).get('/api/v1/boards').expect(401);
    await RefreshSession.updateMany({}, { revokedAt: new Date() });
    const response = await request(app).get('/api/v1/boards').set('Authorization', `Bearer ${token}`).expect(401);
    expect(response.body.error.code).toBe('SESSION_INVALIDATED');
});

it('uses fresh verification state without requiring a new access token', async () => {
    const get = () => request(app).get('/api/v1/workflow-templates').set('Authorization', `Bearer ${token}`);
    await get().expect(403);
    await User.updateOne({ _id: user._id }, { emailVerifiedAt: new Date() });
    await get().expect(200);
    await User.updateOne({ _id: user._id }, { emailVerifiedAt: null });
    await get().expect(403);
});

it('leaves account reads, edits and verification request accessible', async () => {
    for (const path of ['/auth/me', '/auth/profile']) {
        await request(app).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).expect(200);
    }
    await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated', email: user.email }).expect(200);
    const result = await request(app).post('/api/v1/auth/verification/request').set('Authorization', `Bearer ${token}`).send({}).expect(503);
    expect(result.body.error.code).toBe('EMAIL_VERIFICATION_UNAVAILABLE');
});

it('does not gate public health, registration policy or proof completion', async () => {
    await request(app).get('/health').expect(200);
    await request(app).get('/api/v1/auth/registration').expect(200);
    const result = await request(app).post('/api/v1/auth/verify-email').send({ token: 'a'.repeat(64) }).expect(400);
    expect(result.body.error.code).toBe('EMAIL_VERIFICATION_INVALID');
});

it('defaults off and snapshots enforcement per app, independently of delivery', async () => {
    expect(emailVerificationRequired({})).toBe(false);
    expect(emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: 'true' })).toBe(true);
    expect(() => emailVerificationRequired({ EMAIL_VERIFICATION_REQUIRED: 'yes' })).toThrow();
    vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', 'false');
    const disabled = createApp();
    await request(disabled).get('/api/v1/workflow-templates').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).get('/api/v1/workflow-templates').set('Authorization', `Bearer ${token}`).expect(403);
});
