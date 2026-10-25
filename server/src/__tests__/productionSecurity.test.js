// Tests startup rejection of unsafe production configuration with fixture keys.
// No deployment or provider connection is made. Optional integrations can stay
// disabled, but partial configuration and shared/weak secrets must fail safely.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProductionSecurity } from '../config/productionSecurity.js';
import { decryptGitHubToken, encryptGitHubToken } from '../models/GitHubAccount.js';

// Deterministic fixtures, not examples of how production secrets are generated.
const jwtKey = '0123456789abcdef'.repeat(4);
const encryptionKey = 'fedcba9876543210'.repeat(4);
const valid = () => ({ NODE_ENV: 'production', JWT_SECRET: jwtKey, MONGO_URI: 'mongodb://db.example.test/app' });
const github = () => ({ ...valid(), GITHUB_CLIENT_ID: 'fixture-id', GITHUB_CLIENT_SECRET: 'fixture-secret',
    GITHUB_CALLBACK_URL: 'https://app.example.test/api/v1/integrations/github/callback', GITHUB_TOKEN_ENCRYPTION_KEY: encryptionKey });
afterEach(() => vi.unstubAllEnvs());

describe('production security startup checks', () => {
    it('permits an API with optional providers disabled', () => {
        expect(() => validateProductionSecurity(valid())).not.toThrow();
        expect(() => validateProductionSecurity(github())).not.toThrow();
    });
    it.each(['development', 'test'])('does not impose production keys in %s', (NODE_ENV) => {
        expect(() => validateProductionSecurity({ NODE_ENV })).not.toThrow();
    });
    it('treats unset NODE_ENV as production and rejects misspellings', () => {
        expect(() => validateProductionSecurity({})).toThrow('JWT_SECRET');
        expect(() => validateProductionSecurity({ NODE_ENV: 'prod' })).toThrow('NODE_ENV');
    });
    it.each([undefined, '', 'short', 'a'.repeat(64), 'your_secret_'.repeat(5), ` ${jwtKey}`])('rejects absent or unsuitable signing key %#', (JWT_SECRET) => {
        expect(() => validateProductionSecurity({ ...valid(), JWT_SECRET })).toThrow('JWT_SECRET');
    });
    it.each([undefined, '', 'your_mongodb_connection_string_here', 'https://db.example.test'])('rejects invalid database configuration %#', (MONGO_URI) => {
        expect(() => validateProductionSecurity({ ...valid(), MONGO_URI })).toThrow('MONGO_URI');
    });
    it.each(['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL', 'GITHUB_TOKEN_ENCRYPTION_KEY'])('rejects partial GitHub configuration missing %s', (key) => {
        const env = github();
        delete env[key];
        expect(() => validateProductionSecurity(env)).toThrow(key);
    });
    it('requires distinct signing and encryption keys', () => {
        expect(() => validateProductionSecurity({ ...github(), GITHUB_TOKEN_ENCRYPTION_KEY: jwtKey })).toThrow('must differ');
    });
    it('requires AI key and model together', () => {
        expect(() => validateProductionSecurity({ ...valid(), OPENAI_API_KEY: 'fixture' })).toThrow('configured together');
        expect(() => validateProductionSecurity({ ...valid(), OPENAI_TASK_DRAFT_MODEL: 'fixture' })).toThrow('configured together');
        expect(() => validateProductionSecurity({ ...valid(), OPENAI_API_KEY: 'fixture', OPENAI_TASK_DRAFT_MODEL: 'fixture' })).not.toThrow();
    });
    it('does not echo supplied secrets in validation errors', () => {
        const secret = 'sensitive-bad-key';
        try { validateProductionSecurity({ ...valid(), JWT_SECRET: secret }); }
        catch (error) { expect(error.message).not.toContain(secret); return; }
        throw new Error('Expected key validation to fail');
    });
});

it('does not fall back to JWT_SECRET for encryption in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', jwtKey);
    vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', '');
    expect(() => encryptGitHubToken('fixture-access-token')).toThrow('not configured');
    vi.stubEnv('GITHUB_TOKEN_ENCRYPTION_KEY', encryptionKey);
    const encrypted = encryptGitHubToken('fixture-access-token');
    expect(encrypted).not.toContain('fixture-access-token');
    expect(decryptGitHubToken(encrypted)).toBe('fixture-access-token');
});
