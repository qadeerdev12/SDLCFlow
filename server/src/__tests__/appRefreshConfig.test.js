import { afterEach, expect, it, vi } from 'vitest';
import request from './helpers/http.js';
import { createApp } from '../app.js';

afterEach(() => vi.unstubAllEnvs());

it('uses CLIENT_ORIGIN for both credentialed CORS and the cookie guard', async () => {
    vi.stubEnv('CLIENT_ORIGIN', 'https://app.example.com,https://preview.example.com');
    const app = createApp({ refresh: {} });
    for (const origin of ['https://app.example.com', 'https://preview.example.com']) {
        const preflight = await request(app).options('/api/v1/auth/refresh')
            .set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
        expect(preflight.headers['access-control-allow-origin']).toBe(origin);
        expect(preflight.headers['access-control-allow-credentials']).toBe('true');
        // Missing cookie is rejected after the origin/CSRF guard, without a DB.
        const response = await request(app).post('/api/v1/auth/refresh')
            .set('Origin', origin).set('X-SDLCFlow-CSRF', '1').send({}).expect(401);
        expect(response.body.error.code).toBe('REFRESH_INVALID');
    }
    const rejected = await request(app).post('/api/v1/auth/refresh')
        .set('Origin', 'https://untrusted.example.com').set('X-SDLCFlow-CSRF', '1').send({}).expect(403);
    expect(rejected.body.error.code).toBe('CSRF_REJECTED');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    expect(rejected.headers['set-cookie']).toBeUndefined();
});

it('rejects HTTP origins unless explicit local development mode is selected', () => {
    vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:5173');
    expect(() => createApp({ refresh: {} })).toThrow('exact HTTPS');
    expect(() => createApp({ refresh: { localHttp: true, environment: 'development' } })).not.toThrow();
    expect(() => createApp({ refresh: { localHttp: true, environment: 'production' } })).toThrow('development/test');
});

it.each(['*', 'https://app.example.com/path', 'https://app.example.com/'])(
    'fails at app construction for invalid cookie origin %s', (origin) => {
        vi.stubEnv('CLIENT_ORIGIN', origin);
        expect(() => createApp({ refresh: {} })).toThrow();
    },
);

it('rejects ambiguous opt-in options and a second origin allowlist', () => {
    expect(() => createApp({ refresh: true })).toThrow('explicit options object');
    expect(() => createApp({ refresh: [] })).toThrow('explicit options object');
    expect(() => createApp({ refresh: { origins: ['https://other.example.com'] } })).toThrow('CLIENT_ORIGIN');
});

it('enables guarded refresh by default and keeps resource endpoints bearer-protected', async () => {
    const app = createApp();
    await request(app).post('/api/v1/auth/refresh').send({}).expect(403);
    expect(() => createApp({ refresh: null })).toThrow('explicit options object');
    const denied = await request(app).get('/api/v1/boards').expect(401);
    expect(denied.body.error.code).toBe('NO_TOKEN_PROVIDED');
    await request(app).get('/health').expect(200);
});
