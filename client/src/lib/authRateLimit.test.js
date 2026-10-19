import { afterEach, expect, it, vi } from 'vitest'
import { authApi } from './api'

afterEach(() => vi.unstubAllGlobals())

it.each(['login', 'register'])('preserves the %s throttle message and retry metadata for the UI', async (action) => {
  const error = {
    code: 'AUTH_RATE_LIMITED',
    message: 'Too many sign-in attempts. Try again in 15 minute(s).',
    retryAfter: 900,
    resetAt: '2026-10-19T00:15:00.000Z',
  }
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ error }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const attempt = action === 'login'
    ? authApi.login('test@example.com', 'test passphrase')
    : authApi.register('Test', 'test@example.com', 'test passphrase')
  await expect(attempt).rejects.toMatchObject({ ...error, status: 429 })
  // Authentication calls must not retry automatically and consume more attempts.
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
