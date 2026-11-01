import { afterEach, expect, it, vi } from 'vitest'
import { requestPasswordReset } from '../lib/passwordRecovery'
afterEach(() => vi.unstubAllGlobals())

// Cookie-changing reset completion is deliberately NOT part of this API helper.
it('requests mail without credentials, redirects, or automatic retries', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 202, headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ data: { message: 'Generic acknowledgement' } }) })
  vi.stubGlobal('fetch', fetch)
  await requestPasswordReset('user@example.com')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { 'X-SDLCFlow-CSRF': '1' }, body: JSON.stringify({ email: 'user@example.com' }) })
})
it('sanitizes ambiguous transport failures without retrying', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('private diagnostic'))
  vi.stubGlobal('fetch', fetch)
  await expect(requestPasswordReset('user@example.com')).rejects.toThrow('Check your inbox')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('preserves rate-limit metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ error: { code: 'AUTH_RATE_LIMITED', retryAfter: 60, message: 'Please wait' } }) }))
  await expect(requestPasswordReset('user@example.com')).rejects.toMatchObject({ status: 429, retryAfter: 60 })
})
