import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { authApi } from '../lib/api'
import { reportSessionFailure } from '../lib/sessionEvents'

const user = { id: 'one', name: 'Test' }
const response = (data, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => data })
let fetchMock
beforeEach(() => {
  localStorage.setItem('token', 'old-token')
  fetchMock = vi.fn().mockResolvedValue(response({ data: user }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
const hook = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

it.each([
  ['updatePassword', ['current passphrase', 'new passphrase'], '/auth/password'],
  ['logoutEverywhere', [], '/auth/logout-all'],
  ['deleteAccount', ['current passphrase'], '/auth/me'],
])('clears legacy credentials after confirmed %s without a second logout', async (action, args, path) => {
  const { result } = hook()
  await waitFor(() => expect(result.current.user).toEqual(user))
  fetchMock.mockResolvedValueOnce(response({ data: {} }))
  await act(async () => result.current[action](...args))
  expect(fetchMock.mock.calls.at(-1)[0]).toContain(path)
  expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer old-token')
  expect(result.current.token).toBeNull()
  expect(localStorage.getItem('token')).toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('clears user and token on a protected REST session failure', async () => {
  const { result } = hook()
  await waitFor(() => expect(result.current.user).toEqual(user))
  fetchMock.mockResolvedValueOnce(response({ error: { code: 'SESSION_INVALIDATED', message: 'Sign in again' } }, 401))
  await act(async () => { await expect(authApi.getProfile('old-token')).rejects.toMatchObject({ code: 'SESSION_INVALIDATED' }) })
  expect(result.current.user).toBe(null)
  expect(result.current.token).toBe(null)
  expect(localStorage.getItem('token')).toBe(null)
  expect(result.current.sessionMessage).toContain('sign in again')
})

it.each([[401, 'INVALID_CREDENTIALS'], [403, 'FORBIDDEN'], [429, 'AUTH_RATE_LIMITED'], [500, 'INTERNAL_SERVER_ERROR']])('does not sign out on %s %s', async (status, code) => {
  const { result } = hook()
  await waitFor(() => expect(result.current.user).toEqual(user))
  fetchMock.mockResolvedValueOnce(response({ error: { code, message: 'Rejected' } }, status))
  await act(async () => { await expect(authApi.updatePassword('wrong', 'new passphrase', 'old-token')).rejects.toThrow() })
  expect(result.current.token).toBe('old-token')
  expect(result.current.user).toEqual(user)
})

it('retains credentials on an initial network failure and supports retry', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const { result } = hook()
  await waitFor(() => expect(result.current.authError).toContain('try again'))
  expect(localStorage.getItem('token')).toBe('old-token')
  act(() => result.current.retrySession())
  await waitFor(() => expect(result.current.user).toEqual(user))
  expect(result.current.authError).toBe('')
})

it('does not restore a user from a late validation response after logout', async () => {
  let finish
  fetchMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const { result } = hook()
  act(() => result.current.logout())
  await act(async () => finish(response({ data: user })))
  expect(result.current.user).toBe(null)
  expect(result.current.token).toBe(null)
})

it('ignores failures from an older token after a fresh login', async () => {
  const { result } = hook()
  await waitFor(() => expect(result.current.user).toEqual(user))
  fetchMock.mockResolvedValueOnce(response({ data: { token: 'new-token', user } }))
  await act(async () => result.current.login('test@example.com', 'a passphrase'))
  act(() => reportSessionFailure('old-token', 'SESSION_INVALIDATED'))
  expect(result.current.token).toBe('new-token')
  expect(localStorage.getItem('token')).toBe('new-token')
  expect(result.current.user).toEqual(user)
})

it('synchronizes cross-tab logout and revalidates a cross-tab login', async () => {
  const { result } = hook()
  await waitFor(() => expect(result.current.user).toEqual(user))
  act(() => {
    localStorage.removeItem('token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', storageArea: localStorage }))
  })
  expect(result.current.user).toBe(null)
  expect(result.current.token).toBe(null)
  act(() => {
    localStorage.setItem('token', 'other-tab-token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', storageArea: localStorage }))
  })
  await waitFor(() => expect(result.current.user).toEqual(user))
  expect(result.current.token).toBe('other-tab-token')
})
