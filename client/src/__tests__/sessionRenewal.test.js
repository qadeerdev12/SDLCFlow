import { afterEach, expect, it, vi } from 'vitest'
import { authApi, integrationApi } from '../lib/api'
import { registerSessionRenewal } from '../lib/sessionRenewal'

let unregister
const response = (status, code) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({ error: { code }, data: {} }) })
afterEach(() => { unregister?.(); vi.unstubAllGlobals() })

it('accepts the OAuth binding cookie on start and preserves credentials after renewal', async () => {
  unregister = registerSessionRenewal({ renew: async () => 'new', isCurrent: (token) => token === 'new' })
  const fetch = vi.fn().mockResolvedValueOnce(response(401, 'SESSION_EXPIRED'))
    .mockResolvedValueOnce(response(200))
  vi.stubGlobal('fetch', fetch)
  await integrationApi.startGitHubOAuth('old')
  expect(fetch).toHaveBeenCalledTimes(2)
  for (const [url, config] of fetch.mock.calls) {
    expect(url).toContain('/integrations/github/start')
    expect(config.credentials).toBe('include')
  }
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
})

it('does not opt unrelated bearer requests into cross-origin cookies', async () => {
  const fetch = vi.fn().mockResolvedValue(response(200))
  vi.stubGlobal('fetch', fetch)
  await integrationApi.getGitHubAccount('token')
  expect(fetch.mock.calls[0][1]).not.toHaveProperty('credentials')
})

it('retries a rejected REST mutation once with the same body and renewed bearer', async () => {
  const renew = vi.fn(async () => 'new')
  unregister = registerSessionRenewal({ renew, isCurrent: (token) => token === 'new' })
  const fetch = vi.fn().mockResolvedValueOnce(response(401, 'SESSION_EXPIRED'))
    .mockResolvedValueOnce(response(200))
  vi.stubGlobal('fetch', fetch)
  await authApi.updateProfile({ name: 'Updated' }, 'old')
  expect(renew).toHaveBeenCalledExactlyOnceWith('old')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1]).toEqual({
    ...fetch.mock.calls[0][1],
    headers: { ...fetch.mock.calls[0][1].headers, Authorization: 'Bearer new' },
  })
})

it.each([[401, 'SESSION_INVALIDATED'], [401, 'INVALID_CREDENTIALS'], [403, 'FORBIDDEN'], [503, 'AUTH_UNAVAILABLE']])(
  'does not renew or replay HTTP %s %s', async (status, code) => {
    const renew = vi.fn()
    unregister = registerSessionRenewal({ renew, isCurrent: () => true })
    const fetch = vi.fn().mockResolvedValue(response(status, code))
    vi.stubGlobal('fetch', fetch)
    await expect(authApi.getMe('old')).rejects.toHaveProperty('code', code)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(renew).not.toHaveBeenCalled()
  },
)

it('does not renew after an uncertain network failure', async () => {
  const renew = vi.fn()
  unregister = registerSessionRenewal({ renew, isCurrent: () => true })
  const fetch = vi.fn().mockRejectedValue(new TypeError('Offline'))
  vi.stubGlobal('fetch', fetch)
  await expect(authApi.updateProfile({ name: 'Updated' }, 'old')).rejects.toThrow('Offline')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(renew).not.toHaveBeenCalled()
})

it('does not retry after the provider owning renewal is replaced', async () => {
  unregister = registerSessionRenewal({
    renew: async () => {
      unregister()
      unregister = registerSessionRenewal({ renew: vi.fn(), isCurrent: () => true })
      return 'new'
    },
    isCurrent: () => true,
  })
  const fetch = vi.fn().mockResolvedValue(response(401, 'SESSION_EXPIRED'))
  vi.stubGlobal('fetch', fetch)
  await expect(authApi.getMe('old')).rejects.toHaveProperty('code', 'AUTH_OPERATION_STALE')
  expect(fetch).toHaveBeenCalledTimes(1)
})
