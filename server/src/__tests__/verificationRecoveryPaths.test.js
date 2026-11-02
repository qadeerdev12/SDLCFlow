// Exercise recovery under the real rollout policy, not a mocked auth guard.
// Only mail transport is mocked; proof, cookies and sessions use disposable MongoDB.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { issueAccess } from './helpers/auth.js';
import rawRequest from './helpers/http.js';
import { createApp } from '../app.js';
import { createServerLifecycle } from '../services/serverLifecycle.js';
import User from '../models/User.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { sendEmailVerificationEmail } from '../services/emailVerificationEmailService.js';
import { sendPasswordRecoveryEmail } from '../services/passwordRecoveryEmailService.js';

vi.mock('../services/emailVerificationEmailService.js', () => ({ sendEmailVerificationEmail: vi.fn() }));
vi.mock('../services/passwordRecoveryEmailService.js', () => ({ sendPasswordRecoveryEmail: vi.fn() }));

let mongo, app, lifecycle, user, token;
const password = 'original recovery passphrase';
const replacement = 'replacement recovery passphrase';
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
const auth = (path, method = 'post') => request(app)[method](`/api/v1/auth/${path}`);
const owner = (path, method = 'get') => auth(path, method).set('Authorization', `Bearer ${token}`);
const login = (value = password) => auth('login').send({ email: user.email, password: value });
const resources = (access = token) => request(app).get('/api/v1/workflow-templates').set('Authorization', `Bearer ${access}`);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await EmailVerificationToken.init();
  await PasswordResetToken.init();
}, 60_000);
beforeEach(async () => {
  for (const [key, value] of Object.entries({
    JWT_SECRET: 'verification-recovery-tests', CLIENT_ORIGIN: 'http://localhost:5173',
    EMAIL_VERIFICATION_REQUIRED: 'true', EMAIL_VERIFICATION_ENABLED: 'true',
    EMAIL_VERIFICATION_ORIGIN: 'http://localhost:5173', PASSWORD_RECOVERY_ENABLED: 'true',
    PASSWORD_RESET_ORIGIN: 'http://localhost:5173', REGISTRATION_MODE: 'restricted',
    BREVO_API_KEY: 'fake-key', EMAIL_FROM_NAME: 'Test', EMAIL_FROM_ADDRESS: 'sender@example.test',
  })) vi.stubEnv(key, value);
  lifecycle = createServerLifecycle();
  app = createApp({ lifecycle });
  user = await User.create({ name: 'Test', email: 'owner@example.test', passwordHash: await bcrypt.hash(password, 4) });
  token = await issueAccess(user);
  sendEmailVerificationEmail.mockResolvedValue(undefined);
  sendPasswordRecoveryEmail.mockResolvedValue(undefined);
});
afterEach(async () => {
  await lifecycle.waitForIdle();
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs();
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

it('keeps Profile usable, sends and confirms proof, then restores access with the original bearer', async () => {
  expect((await resources().expect(403)).body.error.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  expect((await owner('profile').expect(200)).body.data.user.emailVerified).toBe(false);
  await owner('profile', 'patch').send({ name: 'Updated name' }).expect(200);
  await owner('verification/request', 'post').send({}).expect(202);
  await lifecycle.waitForIdle();
  // Repeated clicks remain subject to the account cooldown even while restricted.
  await owner('verification/request', 'post').send({}).expect(202);
  await lifecycle.waitForIdle();
  expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
  const message = sendEmailVerificationEmail.mock.calls[0][0];
  expect(message.email).toBe(user.email);
  const confirmed = await auth('verify-email').send({ token: message.token }).expect(200);
  expect(confirmed.headers['set-cookie']).toBeUndefined();
  expect((await owner('me').expect(200)).body.data.emailVerified).toBe(true);
  await resources().expect(200);
  await auth('verify-email').send({ token: message.token }).expect(400);
});

it('allows login, refresh and family logout without bypassing verification', async () => {
  const signedIn = await login().expect(200);
  const refreshed = await auth('refresh').set('Cookie', cookie(signedIn)).send({}).expect(200);
  const access = refreshed.body.data.token;
  await resources(access).expect(403);
  await auth('logout').set('Cookie', cookie(refreshed)).send({}).expect(200);
  await auth('me', 'get').set('Authorization', `Bearer ${access}`).expect(401);
  // The independent session created by the fixture was not logged out.
  await owner('me').expect(200);
});

it('allows log out everywhere and revokes the original session', async () => {
  await owner('logout-all', 'post').send({}).expect(200);
  await owner('me').expect(401);
  const signedIn = await login().expect(200);
  await resources(signedIn.body.data.token).expect(403);
});

it('requires the current password for password changes and does not auto-verify', async () => {
  await owner('password', 'patch').send({ currentPassword: 'wrong password', newPassword: replacement }).expect(401);
  await owner('me').expect(200);
  await owner('password', 'patch').send({ currentPassword: password, newPassword: replacement }).expect(200);
  await owner('me').expect(401);
  const signedIn = await login(replacement).expect(200);
  expect(signedIn.body.data.user.emailVerified).toBe(false);
  await resources(signedIn.body.data.token).expect(403);
});

it('completes password recovery without a bearer but still requires separate verification', async () => {
  await auth('forgot-password').send({ email: user.email }).expect(202);
  await lifecycle.waitForIdle();
  expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
  const message = sendPasswordRecoveryEmail.mock.calls[0][0];
  expect(message.email).toBe(user.email);
  await auth('reset-password').send({ token: message.token, newPassword: replacement }).expect(200);
  await owner('me').expect(401);
  await login().expect(401);
  const signedIn = await login(replacement).expect(200);
  expect(signedIn.body.data.user.emailVerified).toBe(false);
  await resources(signedIn.body.data.token).expect(403);
  await auth('verification/request').set('Authorization', `Bearer ${signedIn.body.data.token}`).send({}).expect(202);
  await lifecycle.waitForIdle();
  expect(sendEmailVerificationEmail).toHaveBeenCalledTimes(1);
});

it('allows deletion only with the correct password while unverified', async () => {
  await owner('me', 'delete').send({ password: 'wrong password' }).expect(401);
  expect(await User.exists({ _id: user._id })).toBeTruthy();
  await owner('me', 'delete').send({ password }).expect(200);
  expect(await User.exists({ _id: user._id })).toBeNull();
  await owner('me').expect(401);
});

it('retains authentication, origin and signup restrictions on recovery routes', async () => {
  await auth('verification/request').send({}).expect(401);
  await rawRequest(app).post('/api/v1/auth/verification/request')
    .set('Authorization', `Bearer ${token}`).send({}).expect(403);
  await rawRequest(app).post('/api/v1/auth/forgot-password').send({ email: user.email }).expect(403);
  await auth('register').send({ name: 'New', email: 'new@example.test', password }).expect(403);
  expect(sendEmailVerificationEmail).not.toHaveBeenCalled();
  expect(sendPasswordRecoveryEmail).not.toHaveBeenCalled();
});

it('keeps Profile and logout available when mail delivery fails without granting access', async () => {
  sendEmailVerificationEmail.mockRejectedValue(new Error('mock transport failure'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await owner('verification/request', 'post').send({}).expect(202);
  await lifecycle.waitForIdle();
  expect((await owner('profile').expect(200)).body.data.user.emailVerified).toBe(false);
  await resources().expect(403);
  await owner('logout-all', 'post').send({}).expect(200);
});
