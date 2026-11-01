// Real disposable storage, fake Brevo boundary. Responses must not depend on
// account existence or provider latency; background work is explicitly drained.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createHash } from 'node:crypto';
import request from './helpers/auth.js';
import rawRequest from './helpers/http.js';
import { createApp } from '../app.js';
import User from '../models/User.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { createServerLifecycle } from '../services/serverLifecycle.js';
import { sendPasswordRecoveryEmail } from '../services/passwordRecoveryEmailService.js';
import { createForgotPasswordHandler, RECOVERY_REQUEST_MESSAGE } from '../controllers/forgotPasswordController.js';
vi.mock('../services/passwordRecoveryEmailService.js', () => ({ sendPasswordRecoveryEmail: vi.fn() }));

let mongo, lifecycle, app, user;
const path = '/api/v1/auth/forgot-password';
beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await PasswordResetToken.init();
}, 60_000);
beforeEach(async () => {
    vi.stubEnv('PASSWORD_RECOVERY_ENABLED', 'true');
    vi.stubEnv('PASSWORD_RESET_ORIGIN', 'http://localhost:5173');
    vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:5173');
    vi.stubEnv('BREVO_API_KEY', 'fake-key');
    vi.stubEnv('EMAIL_FROM_NAME', 'SDLCFlow');
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'sender@example.test');
    lifecycle = createServerLifecycle();
    app = createApp({ lifecycle });
    user = await User.create({ name: 'Test', email: 'user@example.test', passwordHash: 'untouched' });
    sendPasswordRecoveryEmail.mockResolvedValue(undefined);
});
afterEach(async () => {
    await lifecycle.waitForIdle();
    vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs();
    await PasswordResetToken.deleteMany({}); await User.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
const send = (body = { email: user.email }) => request(app).post(path).send(body);

it('responds identically for known, unknown and cooldown-suppressed addresses', async () => {
    const responses = [await send(), await send({ email: 'unknown@example.test' }), await send()];
    for (const response of responses) {
        expect(response.status).toBe(202);
        expect(response.body).toEqual({ data: { message: RECOVERY_REQUEST_MESSAGE } });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['set-cookie']).toBeUndefined();
    }
    await lifecycle.waitForIdle();
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
    const account = await User.findById(user._id).select('+passwordHash +sessionVersion');
    expect(account.passwordHash).toBe('untouched');
    expect(account.sessionVersion).toBe(0);
});

it('uses only the stored recipient and trusted origin, ignoring attacker-supplied URL/recipient fields', async () => {
    await send({ email: ' USER@EXAMPLE.TEST ', to: 'attacker@example.test', origin: 'https://evil.example' }).expect(202);
    await lifecycle.waitForIdle();
    const message = sendPasswordRecoveryEmail.mock.calls[0][0];
    expect(message.email).toBe(user.email);
    expect(message.options.origin).toBe('http://localhost:5173');
    const stored = await PasswordResetToken.findOne().lean();
    expect(stored.tokenDigest).toBe(createHash('sha256').update(message.token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(message.token);
});

it('responds before a slow provider finishes and keeps shutdown waiting for delivery work', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    sendPasswordRecoveryEmail.mockReturnValue(pending);
    try {
        await send().expect(202);
        await vi.waitFor(() => expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1));
        lifecycle.beginDrain();
        let idle = false;
        const drained = lifecycle.waitForIdle().then(() => { idle = true; });
        await new Promise((resolve) => setImmediate(resolve));
        expect(idle).toBe(false);
        await send().expect(503);
        release(); await drained;
        expect(idle).toBe(true);
    } finally { release(); }
});

it('acknowledges before even the user lookup completes', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    vi.spyOn(User, 'findOne').mockReturnValueOnce({ select: () => ({ lean: () => pending }) });
    try { await send().expect(202); } finally { release(null); }
    await lifecycle.waitForIdle();
    expect(sendPasswordRecoveryEmail).not.toHaveBeenCalled();
});

it.each(['provider', 'database'])('does not expose %s failures or retry automatically', async (failure) => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    if (failure === 'provider') sendPasswordRecoveryEmail.mockRejectedValueOnce(new Error('private-secret'));
    else vi.spyOn(User, 'findOne').mockImplementationOnce(() => { throw new Error('private-secret'); });
    const result = await send().expect(202);
    await lifecycle.waitForIdle();
    expect(JSON.stringify([result.body, log.mock.calls])).not.toContain('private-secret');
    await send().expect(202);
    await lifecycle.waitForIdle();
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(failure === 'provider' ? 1 : 0);
});

it('rejects bad bodies/origins before work and enforces the IP budget before parsing', async () => {
    await rawRequest(app).post(path).send({ email: user.email }).expect(403);
    await send({ email: { $ne: null } }).expect(400);
    await send({ email: 'invalid' }).expect(400);
    await send({ email: user.email, padding: 'x'.repeat(2000) }).expect(413);
    await send({ email: 'missing@example.test' }).expect(202);
    const result = await request(app).post(path).send('{').expect(429);
    expect(result.headers['retry-after']).toBeDefined();
    await lifecycle.waitForIdle();
    expect(sendPasswordRecoveryEmail).not.toHaveBeenCalled();
});

it('returns a uniform unavailable error when disabled and never dispatches', async () => {
    vi.stubEnv('PASSWORD_RECOVERY_ENABLED', 'false');
    app = createApp({ lifecycle });
    await send().expect(503);
    await send({ email: 'missing@example.test' }).expect(503);
    expect(sendPasswordRecoveryEmail).not.toHaveBeenCalled();
});

// Direct handler calls bypass the separate IP budget to exercise global capacity
// and recipient suppression under requests from many different clients.
function directHandler() {
    const handler = createForgotPasswordHandler({ options: { origin: 'https://app.example.com' }, lifecycle });
    return (email) => {
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
        handler({ body: { email } }, res);
        expect(res.status).toHaveBeenCalledWith(202);
        return res;
    };
}
it('caps active work at four even when lookup is stalled', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const lookup = vi.spyOn(User, 'findOne').mockReturnValue({ select: () => ({ lean: () => pending }) });
    try {
        const dispatch = directHandler();
        for (let i = 0; i < 10; i++) dispatch(`user${i}@example.test`);
        await new Promise((resolve) => setImmediate(resolve));
        expect(lookup).toHaveBeenCalledTimes(4);
    } finally { release(null); }
});

it('preserves the current link during cooldown, then permits a fresh request after fifteen minutes', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const dispatch = directHandler();
    dispatch(user.email);
    await lifecycle.waitForIdle();
    const first = (await PasswordResetToken.findOne().lean()).tokenDigest;
    dispatch(user.email.toUpperCase());
    await lifecycle.waitForIdle();
    expect((await PasswordResetToken.findOne().lean()).tokenDigest).toBe(first);
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
    Date.now.mockReturnValue(now + 15 * 60 * 1000);
    dispatch(user.email);
    await lifecycle.waitForIdle();
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(2);
    expect((await PasswordResetToken.findOne().lean()).tokenDigest).not.toBe(first);
});

it('caps admission at twenty per hour and permits cooldown expiry without retaining unbounded keys', async () => {
    const lookup = vi.spyOn(User, 'findOne');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const dispatch = directHandler();
    for (let i = 0; i < 25; i++) {
        dispatch(`missing${i}@example.test`);
        await lifecycle.waitForIdle();
    }
    expect(lookup).toHaveBeenCalledTimes(20);
    Date.now.mockReturnValue(now + 60 * 60 * 1000);
    dispatch('missing0@example.test');
    await lifecycle.waitForIdle();
    expect(lookup).toHaveBeenCalledTimes(21);
});
