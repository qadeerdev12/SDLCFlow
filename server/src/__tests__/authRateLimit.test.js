import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { login, register } from '../controllers/authController.js';
import { AUTH_LIMITS } from '../middleware/authRateLimit.js';
import { trustedProxies } from '../utils/trustedProxies.js';

// Exercise the real router/limiter without database or bcrypt work. A blocked
// request must never reach these controller spies.
vi.mock('../controllers/authController.js', () => ({
  login: vi.fn((req, res) => res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } })),
  register: vi.fn((req, res) => res.status(201).json({ data: { created: true } })),
  getMe: vi.fn(), getProfile: vi.fn(), updateProfile: vi.fn(),
  updatePassword: vi.fn(), deleteAccount: vi.fn(), logoutEverywhere: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv('TRUSTED_PROXY_CIDRS', '');
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('authentication throttling', () => {
  it.each(['login', 'register'])('limits %s, returns retry details, and recovers after expiry', async (action) => {
    // Fake Date only: HTTP sockets and library cleanup timers remain real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
    const app = createApp();
    const { limit, windowMs } = AUTH_LIMITS[action];
    const send = () => request(app).post(`/api/v1/auth/${action}`).send({});
    for (let i = 0; i < limit; i++) {
      await send().expect(action === 'login' ? 401 : 201);
    }
    const blocked = await send().expect(429);
    expect(blocked.body.error).toMatchObject({ code: 'AUTH_RATE_LIMITED', retryAfter: windowMs / 1000 });
    expect(blocked.headers['retry-after']).toBe(String(windowMs / 1000));
    expect(blocked.headers.ratelimit).toBeDefined();
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(action === 'login' ? login : register).toHaveBeenCalledTimes(limit);
    vi.setSystemTime(Date.now() + windowMs + 1);
    await send().expect(action === 'login' ? 401 : 201);
  });

  it('keeps login/signup budgets independent and does not throttle health checks', async () => {
    const app = createApp();
    for (let i = 0; i < AUTH_LIMITS.register.limit; i++) {
      await request(app).post('/api/v1/auth/register').send({}).expect(201);
    }
    await request(app).post('/api/v1/auth/register').send({}).expect(429);
    await request(app).post('/api/v1/auth/login').send({}).expect(401);
    await request(app).get('/health').expect(200);
    await request(createApp()).post('/api/v1/auth/register').send({}).expect(201);
  });

  it('ignores forged forwarded headers when no proxy is trusted', async () => {
    const app = createApp();
    await request(app).post('/api/v1/auth/login').send({}).expect(401);
    for (let i = 1; i < AUTH_LIMITS.login.limit; i++) {
      await request(app).post('/api/v1/auth/login')
        .set('X-Forwarded-For', `198.51.100.${i}`).send({ email: `user${i}@example.com` }).expect(401);
    }
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '203.0.113.42').send({}).expect(429);
  });

  it('uses the nearest untrusted address behind an explicitly trusted proxy', async () => {
    vi.stubEnv('TRUSTED_PROXY_CIDRS', '127.0.0.1,::1,::ffff:127.0.0.1');
    const app = createApp();
    for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
      await request(app).post('/api/v1/auth/login')
        .set('X-Forwarded-For', `203.0.113.${i}, 198.51.100.1`).send({}).expect(401);
    }
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '203.0.113.99, 198.51.100.1').send({}).expect(429);
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.2').send({}).expect(401);
  });

  it('groups rotating IPv6 addresses in the same /56', async () => {
    vi.stubEnv('TRUSTED_PROXY_CIDRS', '127.0.0.1,::1,::ffff:127.0.0.1');
    const app = createApp();
    for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
      await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', `2001:db8:1234::${i + 1}`).send({}).expect(401);
    }
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '2001:db8:1234:1::1').send({}).expect(429);
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '2001:db8:5678::1').send({}).expect(401);
  });

  it('rejects blocked requests before parsing malformed JSON', async () => {
    const app = createApp();
    for (let i = 0; i < AUTH_LIMITS.login.limit; i++) {
      await request(app).post('/api/v1/auth/login').send({}).expect(401);
    }
    await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(429);
    expect(login).toHaveBeenCalledTimes(AUTH_LIMITS.login.limit);
  });
});

describe('trusted proxy configuration', () => {
  it('defaults to direct access and accepts explicit networks', () => {
    expect(trustedProxies('')).toBe(false);
    expect(trustedProxies('127.0.0.1, 10.0.0.0/24, ::1')).toEqual(['127.0.0.1', '10.0.0.0/24', '::1']);
  });
  it.each(['true', '1', '*', '0.0.0.0/0', '::/0', '127.0.0.1,', '10.0.0.1/33', '::1/129', '10.0.0.1/24/1'])('rejects unsafe/invalid proxy setting %s', (value) => {
    expect(() => trustedProxies(value)).toThrow('TRUSTED_PROXY_CIDRS');
  });
});
