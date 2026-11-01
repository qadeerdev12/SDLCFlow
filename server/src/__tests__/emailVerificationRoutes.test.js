// Real HTTP/auth/storage boundaries with mocked mail: no real delivery or users.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { issueAccess } from './helpers/auth.js';
import rawRequest from './helpers/http.js';
import { createApp } from '../app.js';
import User from '../models/User.js';
import RefreshSession from '../models/RefreshSession.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import { issueEmailVerificationToken } from '../services/emailVerificationService.js';
import { sendEmailVerificationEmail } from '../services/emailVerificationEmailService.js';
import { createServerLifecycle } from '../services/serverLifecycle.js';
import { VERIFICATION_REQUEST_MESSAGE } from '../controllers/emailVerificationController.js';
vi.mock('../services/emailVerificationEmailService.js', () => ({ sendEmailVerificationEmail: vi.fn() }));

let mongo, app, lifecycle, user, access;
const password = 'verification test passphrase';
const requestPath = '/api/v1/auth/verification/request', confirmPath = '/api/v1/auth/verify-email';
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await EmailVerificationToken.init();
}, 60_000);
beforeEach(async () => {
    for (const [key, value] of Object.entries({ JWT_SECRET: 'verification-route-test-secret',
        CLIENT_ORIGIN: 'http://localhost:5173', EMAIL_VERIFICATION_ENABLED: 'true',
        EMAIL_VERIFICATION_ORIGIN: 'http://localhost:5173', BREVO_API_KEY: 'fake-key',
        EMAIL_FROM_NAME: 'SDLCFlow', EMAIL_FROM_ADDRESS: 'sender@example.test' })) vi.stubEnv(key, value);
    lifecycle = createServerLifecycle();
    app = createApp({ lifecycle });
    user = await User.create({ name: 'Owner', email: 'owner@example.test', passwordHash: await bcrypt.hash(password, 4) });
    access = await issueAccess(user);
    sendEmailVerificationEmail.mockResolvedValue(undefined);
});
afterEach(async () => {
    await lifecycle.waitForIdle();
    vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs();
    for (const model of [User, RefreshSession, EmailVerificationToken]) await model.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
const send = (body = {}) => request(app).post(requestPath).set('Authorization', `Bearer ${access}`).send(body);
const confirm = (token) => request(app).post(confirmPath).send({ token });
const account = () => User.findById(user._id).select('+emailVerifiedAt +sessionVersion +passwordHash').lean();

it('requires a live session and trusted browser origin before requesting mail', async () => {
    await request(app).post(requestPath).send({}).expect(401);
    await rawRequest(app).post(requestPath).set('Authorization', `Bearer ${access}`).send({}).expect(403);
    await RefreshSession.updateMany({}, { revokedAt: new Date() });
    await send().expect(401);
    expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
});

it('sends only to the authenticated stored address with a trusted link origin', async () => {
    const response = await send({ email: 'attacker@example.test', userId: 'attacker', origin: 'https://evil.example' }).expect(202);
    expect(response.body).toEqual({ data: { message: VERIFICATION_REQUEST_MESSAGE } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    await lifecycle.waitForIdle();
    const message = sendEmailVerificationEmail.mock.calls[0][0];
    expect(message.email).toBe(user.email);
    expect(message.options.origin).toBe('http://localhost:5173');
    expect(message.token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(response.body)).not.toContain(message.token);
    expect((await account()).emailVerifiedAt).toBeNull();
});

it('uses an account cooldown across email changes and replaces old links after expiry', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await send().expect(202); await lifecycle.waitForIdle();
    const first = sendEmailVerificationEmail.mock.calls[0][0].token;
    await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`)
        .send({ email: 'new@example.test' }).expect(200);
    await send().expect(202); await lifecycle.waitForIdle();
    expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    Date.now.mockReturnValue(now + 15 * 60 * 1000);
    // Use a fresh bearer after advancing past the original access-token lifetime.
    access = await issueAccess(user);
    await send().expect(202); await lifecycle.waitForIdle();
    const second = sendEmailVerificationEmail.mock.calls[1][0];
    expect(second.email).toBe('new@example.test');
    expect(second.token).not.toBe(first);
    await confirm(first).expect(400);
    await confirm(second.token).expect(200);
});

it('skips already-verified accounts without changing the acknowledgement', async () => {
    await User.updateOne({ _id: user._id }, { emailVerifiedAt: new Date() });
    const response = await send().expect(202);
    await lifecycle.waitForIdle();
    expect(response.body).toEqual({ data: { message: VERIFICATION_REQUEST_MESSAGE } });
    expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
});

it('confirms without login, reveals no identity, and neither changes credentials nor creates sessions', async () => {
    const { token } = await issueEmailVerificationToken(user._id);
    const before = await account();
    const response = await confirm(token).expect(200);
    expect(response.body).toEqual({ data: { verified: true } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    const after = await account();
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.sessionVersion).toBe(before.sessionVersion);
    expect(await RefreshSession.countDocuments()).toBe(1);
    await confirm(token).expect(400);
});

// Owner responses deliberately expose only a boolean; generation/timestamp stay internal.
it('reports current verification status on signup, login, me, profile and profile updates', async () => {
    const me = () => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`);
    expect((await me().expect(200)).body.data.emailVerified).toBe(false);
    const { token } = await issueEmailVerificationToken(user._id);
    await confirm(token).expect(200);
    const owner = (await me().expect(200)).body.data;
    expect(owner.emailVerified).toBe(true);
    expect(owner).not.toHaveProperty('emailVerifiedAt');
    expect(owner).not.toHaveProperty('emailVerificationVersion');
    const profile = await request(app).get('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`).expect(200);
    expect(profile.body.data.user.emailVerified).toBe(true);
    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    expect(login.body.data.user.emailVerified).toBe(true);
    const renamed = await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`).send({ name: 'Renamed' }).expect(200);
    expect(renamed.body.data.user.emailVerified).toBe(true);
    const changed = await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`).send({ email: 'new@example.test' }).expect(200);
    expect(changed.body.data.user.emailVerified).toBe(false);
    const signup = await request(app).post('/api/v1/auth/register').send({ name: 'New', email: 'newuser@example.test', password, emailVerified: true }).expect(201);
    expect(signup.body.data.user.emailVerified).toBe(false);
});

it.each(['expired', 'changed email', 'revoked', 'deleted', 'malformed'])('rejects %s proof without changing account state', async (kind) => {
    let { token } = await issueEmailVerificationToken(user._id);
    if (kind === 'expired') await EmailVerificationToken.updateOne({}, { expiresAt: new Date(0) });
    if (kind === 'changed email') await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${access}`).send({ email: 'new@example.test' }).expect(200);
    if (kind === 'revoked') await User.updateOne({}, { $inc: { sessionVersion: 1 } });
    if (kind === 'deleted') await User.deleteMany({});
    if (kind === 'malformed') token = { $ne: null };
    const result = await confirm(token).expect(400);
    expect(result.body.error.code).toBe('EMAIL_VERIFICATION_INVALID');
    if (kind !== 'deleted') expect((await account()).emailVerifiedAt).toBeNull();
});

it('permits exactly one concurrent confirmation and GET never consumes a link', async () => {
    const { token } = await issueEmailVerificationToken(user._id);
    await request(app).get(confirmPath).expect(404);
    await rawRequest(app).post(confirmPath).send({ token }).expect(403);
    const results = await Promise.all([confirm(token), confirm(token)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
});

it('enforces separate IP budgets before parsing plus small body limits', async () => {
    await send({ padding: 'x'.repeat(2000) }).expect(413);
    for (let i = 0; i < 4; i++) await send().expect(202);
    const limited = await request(app).post(requestPath).send('{').expect(429);
    expect(limited.body.error.message).toContain('email-verification');
    expect(limited.headers['retry-after']).toBeDefined();
    await request(app).post(confirmPath).send({ padding: 'x'.repeat(2000) }).expect(413);
    for (let i = 0; i < 9; i++) await confirm('bad').expect(400);
    await request(app).post(confirmPath).send('{').expect(429);
});

it('keeps confirmation usable when delivery is disabled', async () => {
    const { token } = await issueEmailVerificationToken(user._id);
    vi.stubEnv('EMAIL_VERIFICATION_ENABLED', 'false');
    app = createApp({ lifecycle });
    expect((await send().expect(503)).body.error.code).toBe('EMAIL_VERIFICATION_UNAVAILABLE');
    await confirm(token).expect(200);
    expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
});

it('tracks slow delivery for shutdown but acknowledges without waiting for Brevo', async () => {
    let release;
    sendEmailVerificationEmail.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    try {
        await send().expect(202);
        await vi.waitFor(() => expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1));
        let idle = false;
        const drained = lifecycle.waitForIdle().then(() => { idle = true; });
        await new Promise((resolve) => setImmediate(resolve));
        expect(idle).toBe(false);
        lifecycle.beginDrain();
        await send().expect(503);
        release(); await drained;
    } finally { release?.(); }
});

it('sanitizes provider failures without retries or false confirmation', async () => {
    sendEmailVerificationEmail.mockRejectedValue(new Error('private-provider-secret'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await send().expect(202); await lifecycle.waitForIdle();
    await send().expect(202); await lifecycle.waitForIdle();
    expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-secret');
    expect((await account()).emailVerifiedAt).toBeNull();
});

it('burns a claimed link on write failure without leaking its value', async () => {
    const { token } = await issueEmailVerificationToken(user._id);
    vi.spyOn(User, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error(token); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await confirm(token).expect(500);
    expect(JSON.stringify([response.body, log.mock.calls])).not.toContain(token);
    await confirm(token).expect(400);
});

it('does not issue a fresh link from a stale captured session generation', async () => {
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    expect(await issueEmailVerificationToken(user._id, { expectedSessionVersion: 0 })).toBeNull();
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
});
