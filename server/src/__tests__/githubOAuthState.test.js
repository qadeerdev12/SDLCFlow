// Exercises OAuth state consumption with real storage and mocked GitHub calls.
// A callback must belong to the initiating browser and current session, be usable
// only once, and never persist credentials after access is revoked mid-flight.

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import request from './helpers/http.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createHash } from 'node:crypto';
import { createApp } from '../app.js';
import User from '../models/User.js';
import RefreshSession from '../models/RefreshSession.js';
import GitHubOAuthState from '../models/GitHubOAuthState.js';
import GitHubAccount from '../models/GitHubAccount.js';
import { createAccessToken } from '../utils/accessTokens.js';
import { exchangeCodeForToken, fetchGitHubProfile, fetchPrimaryGitHubEmail } from '../services/githubService.js';

// No provider traffic or real accounts: only the GitHub boundary is mocked.
vi.mock('../services/githubService.js', async (importOriginal) => ({
    ...await importOriginal(),
    exchangeCodeForToken: vi.fn(), fetchGitHubProfile: vi.fn(), fetchPrimaryGitHubEmail: vi.fn(),
}));

let mongo, app, user, family, token;
const base = '/api/v1/integrations/github';
const hash = (value) => createHash('sha256').update(value).digest('hex');

beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'oauth-test-signing-secret');
    vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', 'oauth-test-encryption-secret');
    vi.stubEnv('CLIENT_ORIGIN', 'https://app.example.com');
    vi.stubEnv('CLIENT_URL', 'https://app.example.com');
    vi.stubEnv('GITHUB_CLIENT_ID', 'test-client');
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('GITHUB_CALLBACK_URL', `https://app.example.com${base}/callback`);
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await GitHubOAuthState.init();
}, 60_000);

beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    app = createApp({ refresh: {} });
    user = await User.create({ name: 'OAuth Test', email: 'oauth@example.test', passwordHash: 'unused', sessionVersion: 0 });
    family = await RefreshSession.create({ user: user._id, sessionVersion: 0,
        currentDigest: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600_000) });
    token = createAccessToken({ userId: String(user._id), sessionId: String(family._id),
        sessionVersion: 0, expiresAt: family.expiresAt }).token;
    exchangeCodeForToken.mockResolvedValue({ accessToken: 'provider-test-token', tokenType: 'bearer', scopes: ['repo'] });
    fetchGitHubProfile.mockResolvedValue({ id: 123, login: 'test-user', name: 'Test User' });
    fetchPrimaryGitHubEmail.mockResolvedValue('github@example.test');
});
afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const model of [GitHubOAuthState, GitHubAccount, RefreshSession, User]) await model.deleteMany({});
});
afterAll(async () => { vi.unstubAllEnvs(); await mongoose.disconnect(); await mongo?.stop(); });

async function start() {
    const response = await request(app).get(`${base}/start`).set('Authorization', `Bearer ${token}`).expect(200);
    return { response, state: new URL(response.body.data.authorizationUrl).searchParams.get('state'),
        cookie: response.headers['set-cookie'][0].split(';')[0] };
}
function callback(attempt, query = {}) {
    let req = request(app).get(`${base}/callback`).query({ state: attempt.state, code: 'test-code', ...query });
    if (attempt.cookie) req = req.set('Cookie', attempt.cookie);
    return req;
}
const failed = (response) => expect(response.headers.location).toBe('https://app.example.com/profile?github=error');

it('requires authentication before issuing state', async () => {
    await request(app).get(`${base}/start`).expect(401);
    expect(await GitHubOAuthState.countDocuments()).toBe(0);
});

it('stores only digests and uses a dedicated production Secure, HttpOnly, Lax host cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const attempt = await start();
    expect(attempt.state).toMatch(/^[a-f0-9]{64}$/);
    const cookie = attempt.response.headers['set-cookie'][0];
    for (const value of ['__Host-sdlcflow_github_oauth=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) {
        expect(cookie).toContain(value);
    }
    expect(cookie).not.toContain('Domain=');
    expect(attempt.response.headers['cache-control']).toBe('no-store');
    const record = await GitHubOAuthState.findOne().lean();
    expect(record.stateDigest).toBe(hash(attempt.state));
    expect(record.browserDigest).toBe(hash(attempt.cookie.split('=')[1]));
    expect(JSON.stringify(record)).not.toContain(attempt.state);
    expect(JSON.stringify(record)).not.toContain(attempt.cookie.split('=')[1]);
});

it('connects once, clears its cookie, and rejects replay before another exchange', async () => {
    const attempt = await start();
    const response = await callback(attempt).expect(302);
    expect(response.headers.location).toContain('github=connected');
    expect(response.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await GitHubAccount.countDocuments({ user: user._id })).toBe(1);
    failed(await callback(attempt));
    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
});

it.each(['missing cookie', 'wrong cookie', 'duplicate cookie', 'tampered state', 'array state'])(
    'rejects %s without consuming the valid attempt', async (kind) => {
        const attempt = await start();
        const invalid = { ...attempt };
        if (kind === 'missing cookie') invalid.cookie = null;
        if (kind === 'wrong cookie') invalid.cookie = 'sdlcflow_github_oauth_dev=' + 'b'.repeat(64);
        if (kind === 'duplicate cookie') invalid.cookie += '; ' + invalid.cookie;
        if (kind === 'tampered state') invalid.state = 'c'.repeat(64);
        if (kind === 'array state') invalid.state = [attempt.state, attempt.state];
        failed(await callback(invalid));
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
        expect(await GitHubOAuthState.countDocuments()).toBe(1);
        expect((await callback(attempt)).headers.location).toContain('github=connected');
    },
);

// State must be consumed atomically before provider exchange; two callbacks
// from the same authorization attempt must never both reach GitHub.
it('only permits one concurrent callback to exchange the code', async () => {
    const attempt = await start();
    const responses = await Promise.all([callback(attempt), callback(attempt)]);
    expect(responses.filter((res) => res.headers.location.endsWith('github=connected'))).toHaveLength(1);
    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
});

it('supersedes an older attempt from the same session', async () => {
    const old = await start(), current = await start();
    expect(await GitHubOAuthState.countDocuments()).toBe(1);
    failed(await callback(old));
    failed(await callback({ ...old, cookie: current.cookie }));
    expect((await callback(current)).headers.location).toContain('github=connected');
});

it.each(['expired state', 'revoked session', 'expired session', 'changed version', 'deleted user'])(
    'rejects %s before contacting GitHub', async (kind) => {
        const attempt = await start();
        if (kind === 'expired state') await GitHubOAuthState.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
        if (kind === 'revoked session') await RefreshSession.updateOne({}, { revokedAt: new Date() });
        if (kind === 'expired session') await RefreshSession.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
        if (kind === 'changed version') await User.updateOne({}, { sessionVersion: 1 });
        if (kind === 'deleted user') await User.deleteMany({});
        failed(await callback(attempt));
        expect(exchangeCodeForToken).not.toHaveBeenCalled();
        expect(await GitHubAccount.countDocuments()).toBe(0);
    },
);

it('consumes valid state on provider denial and rejects its later reuse', async () => {
    const attempt = await start();
    const response = await callback(attempt, { error: 'access_denied' });
    expect(response.headers.location).toContain('github=missing_code');
    failed(await callback(attempt));
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
});

it('requires a fresh attempt after a provider failure without logging provider secrets', async () => {
    const attempt = await start();
    exchangeCodeForToken.mockRejectedValueOnce(new Error('sensitive-provider-response'));
    failed(await callback(attempt));
    failed(await callback(attempt));
    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('sensitive-provider-response');
});

// Authorization at callback entry is insufficient: a slow provider response
// must not reconnect an account after its initiating session was invalidated.
it('does not save an account if the session is revoked during provider requests', async () => {
    const attempt = await start();
    fetchGitHubProfile.mockImplementationOnce(async () => {
        await RefreshSession.updateOne({}, { revokedAt: new Date() });
        return { id: 123, login: 'test-user' };
    });
    failed(await callback(attempt));
    expect(await GitHubAccount.countDocuments()).toBe(0);
});

it('fails closed on storage failure and does not issue a cookie', async () => {
    vi.spyOn(GitHubOAuthState, 'findOneAndUpdate').mockRejectedValueOnce(new Error('unavailable'));
    const response = await request(app).get(`${base}/start`).set('Authorization', `Bearer ${token}`).expect(503);
    expect(response.headers['set-cookie']).toBeUndefined();
});
