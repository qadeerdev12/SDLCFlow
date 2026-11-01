// HTTP contract tests: fake fetch only, never send real proof or provider mail.
import { afterEach, expect, it, vi } from 'vitest'
import { confirmEmailVerification } from '../lib/emailVerification'
import { authApi } from '../lib/api'

afterEach(() => vi.unstubAllGlobals())
function reply(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }

it('posts proof with CSRF protection and omits cookies, bearer identity and URL secrets', async () => {
  const fetch = vi.fn().mockResolvedValue(reply(200, { data: { verified: true } }))
  vi.stubGlobal('fetch', fetch)
  await confirmEmailVerification('secret-proof')
  const [url, config] = fetch.mock.calls[0]
  expect(url).toMatch(/\/auth\/verify-email$/)
  expect(url).not.toContain('secret-proof')
  expect(config).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', body: JSON.stringify({ token: 'secret-proof' }) })
  expect(config.headers).toEqual({ 'Content-Type': 'application/json', 'X-SDLCFlow-CSRF': '1' })
})

it('sends an empty resend body so callers cannot override recipient or origin', async () => {
  const fetch = vi.fn().mockResolvedValue(reply(202, { data: { message: 'ack' } }))
  vi.stubGlobal('fetch', fetch)
  await authApi.requestEmailVerification('access-token')
  expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/verification\/request$/)
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit', body: '{}', headers: { Authorization: 'Bearer access-token', 'X-SDLCFlow-CSRF': '1' } })
})

it('preserves rate metadata for a user-driven retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(429, { error: { code: 'AUTH_RATE_LIMITED', message: 'Wait', retryAfter: 60 } })))
  await expect(confirmEmailVerification('proof')).rejects.toMatchObject({ status: 429, code: 'AUTH_RATE_LIMITED', retryAfter: 60 })
})

it.each(['network', 'html', 'malformed', 'server'])('never retries uncertain confirmation: %s', async (kind) => {
  const fetch = vi.fn()
  if (kind === 'network') fetch.mockRejectedValue(new Error('secret internal error'))
  else fetch.mockResolvedValue(kind === 'html' ? new Response('<html>bad</html>') : reply(kind === 'server' ? 500 : 200, {}))
  vi.stubGlobal('fetch', fetch)
  await expect(confirmEmailVerification('proof')).rejects.toThrow('could not be confirmed')
  expect(fetch).toHaveBeenCalledOnce()
})
