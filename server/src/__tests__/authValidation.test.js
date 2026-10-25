// Covers account input helpers and their integration with real HTTP handlers.
// Invalid input must be rejected before mutation, while normalized account
// fields, legacy password login and safe error responses remain compatible.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from './helpers/auth.js';
import { createApp } from '../app.js';
import User from '../models/User.js';
import { authBody, accountName, accountEmail, credentialPassword, newAccountPassword } from '../utils/authValidation.js';

const password = 'a test passphrase';
const account = { name: 'Test User', email: 'test@example.com', password };
let mongo;
const app = createApp();

beforeAll(async () => {
    process.env.JWT_SECRET = 'auth-validation-test-secret';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await User.init();
}, 60_000);
afterEach(async () => {
    vi.restoreAllMocks();
    await User.deleteMany({});
});
afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
});

describe('authentication input boundaries', () => {
    it.each([undefined, null, [], 'text', 12])('rejects non-object bodies: %j', (body) => {
        expect(() => authBody(body)).toThrow();
    });
    it.each([{}, [], 42, null, '', ' ', 'a'.repeat(101)])('rejects invalid names: %j', (name) => {
        expect(() => accountName(name)).toThrow();
    });
    it.each([{}, [], 42, null, '', 'a@b', 'a b@example.com', 'a'.repeat(243) + '@example.com'])('rejects invalid emails: %j', (email) => {
        expect(() => accountEmail(email)).toThrow();
    });
    it('normalizes account fields but preserves password whitespace', () => {
        expect(accountName(' Test ')).toBe('Test');
        expect(accountEmail(' TEST@EXAMPLE.COM ')).toBe('test@example.com');
        expect(newAccountPassword(' a test passphrase ')).toBe(' a test passphrase ');
    });
    it('enforces code-point minimum and UTF-8 byte maximum for new passwords', () => {
        for (const value of ['a'.repeat(15), 'a'.repeat(72), '\u{1F600}'.repeat(18)]) {
            expect(newAccountPassword(value)).toBe(value);
        }
        for (const value of ['a'.repeat(14), 'a'.repeat(73), '\u{1F600}'.repeat(14), '\u{1F600}'.repeat(19)]) {
            expect(() => newAccountPassword(value)).toThrow();
        }
        expect(credentialPassword('x')).toBe('x');
        expect(credentialPassword('x'.repeat(1024))).toHaveLength(1024);
        expect(() => credentialPassword('x'.repeat(1025))).toThrow();
    });

    it.each([
        { email: { $ne: null } }, { email: ['test@example.com'] }, { password: {} },
        { password: 123 }, { password: 'a'.repeat(1025) },
    ])('rejects malformed login before database lookup: %j', async (fields) => {
        const lookup = vi.spyOn(User, 'findOne');
        await request(app).post('/api/v1/auth/login').send({ ...account, ...fields }).expect(400);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('normalizes registration and login, rejects duplicate registration, and omits hashes', async () => {
        const result = await request(app).post('/api/v1/auth/register')
            .send({ ...account, name: ' Test User ', email: ' TEST@EXAMPLE.COM ' }).expect(201);
        expect(result.body.data.user).toMatchObject({ name: account.name, email: account.email });
        expect(result.body.data.user).not.toHaveProperty('passwordHash');
        await request(app).post('/api/v1/auth/login').send({ email: ' TEST@EXAMPLE.COM ', password }).expect(200);
        await request(app).post('/api/v1/auth/register').send(account).expect(409);
    });

    it.each(['x', 'a'.repeat(73), {}, null])('rejects invalid registration passwords: %j', async (value) => {
        await request(app).post('/api/v1/auth/register').send({ ...account, password: value }).expect(400);
        expect(await User.countDocuments()).toBe(0);
    });

    it('preserves legacy login and enforces the new policy on password changes', async () => {
        const user = await User.create({ name: account.name, email: account.email, passwordHash: await bcrypt.hash('x', 4) });
        const login = await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'x' }).expect(200);
        const token = login.body.data.token;
        const change = (body) => request(app).patch('/api/v1/auth/password').set('Authorization', `Bearer ${token}`).send(body);
        await change({ currentPassword: 'x', newPassword: 'short' }).expect(400);
        expect((await User.findById(user._id).select('+passwordHash')).passwordHash).toBe(user.passwordHash);
        await change({ currentPassword: {}, newPassword: password }).expect(400);
        await change({ currentPassword: 'wrong', newPassword: password }).expect(401);
        await change({ currentPassword: 'x', newPassword: ' a test passphrase ' }).expect(200);
        await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'a test passphrase' }).expect(401);
        await request(app).post('/api/v1/auth/login').send({ email: account.email, password: ' a test passphrase ' }).expect(200);
    });

    it('validates profile and delete inputs without changing the user', async () => {
        const result = await request(app).post('/api/v1/auth/register').send(account).expect(201);
        const token = result.body.data.token;
        for (const body of [{ name: {} }, { name: 'a'.repeat(101) }, { email: { $ne: null } }, { email: 'bad-email' }]) {
            await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`).send(body).expect(400);
        }
        await request(app).delete('/api/v1/auth/me').set('Authorization', `Bearer ${token}`).send({ password: {} }).expect(400);
        expect(await User.countDocuments()).toBe(1);
        const updated = await request(app).patch('/api/v1/auth/profile').set('Authorization', `Bearer ${token}`)
            .send({ name: ' Renamed ', email: ' NEW@EXAMPLE.COM ' }).expect(200);
        expect(updated.body.data.user).toMatchObject({ name: 'Renamed', email: 'new@example.com' });
    });

    it('returns a safe conflict for a duplicate-index race without logging input values', async () => {
        vi.spyOn(User, 'create').mockRejectedValue({ code: 11000, message: 'private submitted data' });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await request(app).post('/api/v1/auth/register').send(account).expect(409);
        expect(result.body.error.code).toBe('EMAIL_TAKEN');
        expect(log).not.toHaveBeenCalled();
    });
});
