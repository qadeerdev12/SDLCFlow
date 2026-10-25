import { afterEach, describe, expect, it, vi } from 'vitest';
import request from './helpers/auth.js';
import { createApp } from '../app.js';
import { registrationMode } from '../config/registration.js';
import { register, login } from '../controllers/authController.js';
import { AUTH_LIMITS } from '../middleware/authRateLimit.js';

vi.mock('../controllers/authController.js', () => ({
  register: vi.fn((req, res) => res.status(201).json({ data: { created: true } })),
  login: vi.fn((req, res) => res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } })),
  getMe: vi.fn(), getProfile: vi.fn(), updateProfile: vi.fn(), updatePassword: vi.fn(),
  deleteAccount: vi.fn(), logoutEverywhere: vi.fn(),
}));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('registration admission', () => {
  it('defaults production and unspecified environments to restricted', () => {
    expect(registrationMode({})).toBe('restricted');
    expect(registrationMode({ NODE_ENV: 'production' })).toBe('restricted');
    for (const NODE_ENV of ['test', 'development']) expect(registrationMode({ NODE_ENV })).toBe('open');
    expect(registrationMode({ NODE_ENV: 'production', REGISTRATION_MODE: 'open' })).toBe('open');
  });

  it.each(['closed', 'OPEN', ' ', 'false'])('rejects invalid configuration %s at app construction', (mode) => {
    vi.stubEnv('REGISTRATION_MODE', mode);
    expect(() => createApp()).toThrow('REGISTRATION_MODE');
  });

  it.each(['open', 'restricted'])('reports %s policy without caching it', async (mode) => {
    vi.stubEnv('REGISTRATION_MODE', mode);
    const response = await request(createApp()).get('/api/v1/auth/registration').expect(200);
    expect(response.body).toEqual({ data: { mode } });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('blocks direct requests, forged policy fields and malformed JSON before the controller', async () => {
    vi.stubEnv('REGISTRATION_MODE', 'restricted');
    const app = createApp();
    const response = await request(app).post('/api/v1/auth/register')
      .send({ name: 'Test', email: 'test@example.com', password: 'test-password-123', mode: 'open' }).expect(403);
    expect(response.body.error.code).toBe('REGISTRATION_RESTRICTED');
    expect(response.headers['set-cookie']).toBeUndefined();
    await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{').expect(403);
    expect(register).not.toHaveBeenCalled();
    await request(app).post('/api/v1/auth/login').send({}).expect(401);
    expect(login).toHaveBeenCalledOnce();
  });

  it('retains signup throttling while restricted', async () => {
    vi.stubEnv('REGISTRATION_MODE', 'restricted');
    const app = createApp();
    for (let i = 0; i < AUTH_LIMITS.register.limit; i++) {
      await request(app).post('/api/v1/auth/register').send({}).expect(403);
    }
    await request(app).post('/api/v1/auth/register').send({}).expect(429);
    expect(register).not.toHaveBeenCalled();
  });

  it('captures policy at startup and requires a new app to apply a change', async () => {
    vi.stubEnv('REGISTRATION_MODE', 'open');
    const app = createApp();
    vi.stubEnv('REGISTRATION_MODE', 'restricted');
    await request(app).post('/api/v1/auth/register').send({}).expect(201);
    await request(createApp()).post('/api/v1/auth/register').send({}).expect(403);
    expect(register).toHaveBeenCalledOnce();
  });
});
