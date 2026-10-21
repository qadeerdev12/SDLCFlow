import { afterEach, expect, it, vi } from 'vitest'
import { createRefreshCoordinator } from './refreshCoordinator'

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
  const values = new Map()
  const coordinator = createRefreshCoordinator({
    locks: { request: async (name, options, run) => run() },
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    createChannel: () => ({ addEventListener() {}, removeEventListener() {}, postMessage() {}, close() {} }),
  })
  const attempt = coordinator.mutate(action, { body: { name: 'Test', email: 'test@example.com', password: 'test passphrase' } })
  await expect(attempt).rejects.toMatchObject({ ...error, status: 429 })
  // Authentication calls must not retry automatically and consume more attempts.
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  coordinator.dispose()
})
