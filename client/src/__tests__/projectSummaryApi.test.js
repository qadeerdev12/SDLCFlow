import { afterEach, expect, it, vi } from 'vitest'
import { boardApi } from '../lib/api'

afterEach(() => vi.unstubAllGlobals())
it.each([undefined, false, true])('serializes GitHub consent explicitly: %s', async (includeGitHub) => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ data: {} }) })
  vi.stubGlobal('fetch', fetch)
  await boardApi.summarize('project', 'token', includeGitHub === undefined ? undefined : { includeGitHub })
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ includeGitHub: includeGitHub === true })
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token')
})
