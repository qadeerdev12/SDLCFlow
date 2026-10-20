import { StrictMode } from 'react'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { reportSessionFailure } from '../lib/sessionEvents'
import ProtectedRoute from '../components/ProtectedRoute'
import { authApi } from '../lib/api'
import { renewExpiredSession } from '../lib/sessionRenewal'

const user = { id: 'one', name: 'Test', email: 'test@example.com' }
const access = (token = 'memory-token', nextUser) => ({ token,
  expiresAt: new Date(Date.now() + 900000).toISOString(), ...(nextUser ? { user: nextUser } : {}) })
const response = (data, status = 200) => ({ ok: status < 400, status,
  headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => data })
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
const MemoryProvider = ({ children }) => <AuthProvider mode="memory">{children}</AuthProvider>
const hook = () => renderHook(() => useAuth(), { wrapper: MemoryProvider })
let fetchMock, channels

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  channels = []
  let tail = Promise.resolve()
  vi.stubGlobal('navigator', { locks: { request: (name, options, callback) => {
    const next = tail.then(callback)
    tail = next.catch(() => {})
    return next
  } } })
  vi.stubGlobal('BroadcastChannel', class {
    listeners = new Set()
    constructor() { channels.push(this) }
    addEventListener(name, listener) { this.listeners.add(listener) }
    removeEventListener(name, listener) { this.listeners.delete(listener) }
    postMessage() {}
    close() { this.closed = true }
    receive(data) { for (const listener of this.listeners) listener({ data }) }
  })
  fetchMock = vi.fn(async (url) => url.endsWith('/auth/me')
    ? response({ data: user }) : response({ data: access() }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('opt-in memory authentication provider', () => {
  it('shares REST and socket-style renewal, preserving identity and retrying REST once', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    const pending = deferred()
    fetchMock.mockImplementation(async (url, options) => {
      if (url.endsWith('/auth/refresh')) return pending.promise
      if (options.headers.Authorization === 'Bearer memory-token') {
        return response({ error: { code: 'SESSION_EXPIRED' } }, 401)
      }
      return response({ data: user })
    })
    await act(async () => {
      const rest = authApi.getMe('memory-token')
      const socket = renewExpiredSession('memory-token')
      await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(2))
      pending.resolve(response({ data: access('renewed-token') }))
      await expect(socket).resolves.toBe('renewed-token')
      await expect(rest).resolves.toEqual({ data: user })
    })
    expect(result.current.token).toBe('renewed-token')
    expect(result.current.user).toEqual(user)
    expect(result.current.loading).toBe(false)
    // A delayed expiry from the same family reuses the already-renewed token.
    await expect(renewExpiredSession('memory-token')).resolves.toBe('renewed-token')
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(2)
  })

  it('does not retry an old account request after signing into another account', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    const pending = deferred()
    fetchMock.mockReturnValueOnce(pending.promise)
    const request = authApi.getMe('memory-token')
    const rejected = expect(request).rejects.toHaveProperty('code', 'AUTH_OPERATION_STALE')
    fetchMock.mockResolvedValueOnce(response({ data: access('other-token', { ...user, id: 'two' }) }))
    await act(async () => result.current.login('other@example.com', 'password'))
    await act(async () => {
      pending.resolve(response({ error: { code: 'SESSION_EXPIRED' } }, 401))
      await rejected
    })
    expect(result.current.token).toBe('other-token')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('ends the session if the once-retried REST request is also expired', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    fetchMock.mockImplementation(async (url) => url.endsWith('/auth/refresh')
      ? response({ data: access('renewed-token') })
      : response({ error: { code: 'SESSION_EXPIRED' } }, 401))
    await act(async () => {
      await expect(authApi.getMe('memory-token')).rejects.toHaveProperty('code', 'SESSION_EXPIRED')
    })
    expect(result.current.token).toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(2)
  })

  it('fails closed when a renewal response is lost and never blindly retries it', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'SESSION_EXPIRED' } }, 401))
      .mockRejectedValueOnce(new TypeError('Offline'))
    await act(async () => {
      await expect(authApi.getMe('memory-token')).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    })
    expect(result.current.needsSignIn).toBe(true)
    await expect(renewExpiredSession('memory-token')).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('bootstraps from the refresh cookie, never a stored token, then loads the user', async () => {
    localStorage.setItem('token', 'legacy-secret')
    const { result } = hook()
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.user).toEqual(user))
    expect(result.current.token).toBe('memory-token')
    expect(result.current.expiresAt).toBeTruthy()
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/refresh')
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer memory-token')
    expect(localStorage.getItem('token')).toBe('legacy-secret') // Removal belongs to cutover.
    expect(JSON.stringify(localStorage)).not.toContain('memory-token')
    expect(sessionStorage.length).toBe(0)
  })

  it('creates only one active bootstrap under StrictMode replay', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <StrictMode><MemoryProvider>{children}</MemoryProvider></StrictMode> })
    await waitFor(() => expect(result.current.user).toEqual(user))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
    expect(channels.filter((channel) => !channel.closed)).toHaveLength(1)
  })

  it('restores again after unmount/remount instead of persisting access credentials', async () => {
    const first = hook()
    await waitFor(() => expect(first.result.current.user).toEqual(user))
    first.unmount()
    const second = hook()
    await waitFor(() => expect(second.result.current.user).toEqual(user))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(2)
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('treats an absent/invalid refresh session as signed out', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'REFRESH_INVALID' } }, 401))
    const { result } = hook()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.sessionMessage).toContain('sign in again')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a failed /me read with the same memory token without rotating again', async () => {
    fetchMock.mockResolvedValueOnce(response({ data: access() })).mockRejectedValueOnce(new TypeError('Offline'))
    const { result } = hook()
    await waitFor(() => expect(result.current.authError).toContain('try again'))
    expect(result.current.token).toBe('memory-token')
    await act(async () => result.current.retrySession())
    expect(result.current.user).toEqual(user)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('shows sign-in recovery for a lost refresh response instead of retrying rotation', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
    const { result } = hook()
    await waitFor(() => expect(result.current.needsSignIn).toBe(true))
    expect(result.current.authError).toContain('sign in again')
    await act(async () => result.current.retrySession())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValueOnce(response({ data: access('new-token', user) }))
    await act(async () => result.current.login(user.email, 'secret-password'))
    expect(result.current.token).toBe('new-token')
    expect(result.current.needsSignIn).toBe(false)
    expect(result.current.authError).toBe('')
  })

  it('respects the refresh rate-limit delay before explicit retry', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'AUTH_RATE_LIMITED', message: 'Wait before trying again.', retryAfter: 60 } }, 429))
    const { result } = hook()
    await waitFor(() => expect(result.current.authError).toContain('Wait'))
    await act(async () => result.current.retrySession())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 61000)
    await act(async () => result.current.retrySession())
    await waitFor(() => expect(result.current.user).toEqual(user))
  })

  it.each(['login', 'register'])('commits %s results in memory through the coordinator', async (action) => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    const nextUser = { ...user, id: 'two', name: 'New' }
    fetchMock.mockResolvedValueOnce(response({ data: access('new-token', nextUser) }))
    await act(async () => action === 'login' ? result.current.login(user.email, 'secret-password')
      : result.current.register('New', user.email, 'secret-password'))
    expect(result.current.user).toEqual(nextUser)
    expect(result.current.token).toBe('new-token')
    expect(fetchMock.mock.calls.at(-1)[1].headers['X-SDLCFlow-CSRF']).toBe('1')
    expect(JSON.stringify(localStorage)).not.toContain('new-token')
    act(() => reportSessionFailure('memory-token', 'SESSION_INVALIDATED'))
    expect(result.current.token).toBe('new-token')
  })

  it('does not accept a late /me response after successful server logout', async () => {
    const pending = deferred()
    fetchMock.mockResolvedValueOnce(response({ data: access() })).mockReturnValueOnce(pending.promise)
    const { result } = hook()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    fetchMock.mockResolvedValueOnce(response({ data: { loggedOut: true } }))
    await act(async () => result.current.logout())
    await act(async () => pending.resolve(response({ data: user })))
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('preserves current credentials and rejects when server logout cannot be confirmed', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
    await act(async () => { await expect(result.current.logout()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED') })
    expect(result.current.user).toEqual(user)
    expect(result.current.token).toBe('memory-token')
    const count = fetchMock.mock.calls.length
    await act(async () => result.current.logout('old-token'))
    expect(fetchMock).toHaveBeenCalledTimes(count)
  })

  it('clears a revoked current token and ignores a late user lookup', async () => {
    const pending = deferred()
    fetchMock.mockResolvedValueOnce(response({ data: access() })).mockReturnValueOnce(pending.promise)
    const { result } = hook()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    act(() => reportSessionFailure('memory-token', 'SESSION_INVALIDATED'))
    await act(async () => pending.resolve(response({ data: user })))
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
  })

  it('handles cross-tab changes without a refresh loop or applying stale identity', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    localStorage.setItem('sdlcflow:auth-revision:v1', JSON.stringify({ revision: 'another-tab', blocked: false }))
    act(() => channels.at(-1).receive({ type: 'session-changed', revision: 'another-tab' }))
    expect(result.current.user).toBeNull()
    expect(result.current.token).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.authError).toContain('another tab')
    await act(async () => result.current.retrySession())
    await waitFor(() => expect(result.current.user).toEqual(user))
  })

  it('fails clearly on unsupported coordination without falling back to localStorage', async () => {
    vi.stubGlobal('navigator', {})
    localStorage.setItem('token', 'legacy-token')
    const { result } = hook()
    await waitFor(() => expect(result.current.authError).toContain('cannot coordinate'))
    expect(result.current.token).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a sign-in action rather than an unsafe refresh retry after ambiguous failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Offline'))
    render(<MemoryRouter><MemoryProvider><ProtectedRoute>Private content</ProtectedRoute></MemoryProvider></MemoryRouter>)
    expect((await screen.findByRole('link', { name: 'Sign in' })).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByText('Private content')).toBeNull()
  })

  it('does not install an older bootstrap result after a new login intent', async () => {
    const pending = deferred()
    fetchMock.mockReturnValueOnce(pending.promise)
    const { result } = hook()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const nextUser = { id: 'two', name: 'New account' }
    fetchMock.mockResolvedValueOnce(response({ data: access('new-token', nextUser) }))
    await act(async () => {
      const login = result.current.login('new@example.com', 'passphrase')
      pending.resolve(response({ data: access('old-bootstrap-token') }))
      await login
    })
    expect(result.current.user).toEqual(nextUser)
    expect(result.current.token).toBe('new-token')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/me'))).toBe(false)
  })

  it('preserves the signed-in session after rejected login credentials', async () => {
    const { result } = hook()
    await waitFor(() => expect(result.current.user).toEqual(user))
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, 401))
    await act(async () => { await expect(result.current.login('other@example.com', 'wrong')).rejects.toHaveProperty('code', 'INVALID_CREDENTIALS') })
    expect(result.current.user).toEqual(user)
    expect(result.current.token).toBe('memory-token')
  })

  it('disposes listeners and prevents pending user data from leaking into a remount', async () => {
    const pending = deferred()
    fetchMock.mockResolvedValueOnce(response({ data: access() })).mockReturnValueOnce(pending.promise)
    const first = hook()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    first.unmount()
    expect(channels[0].closed).toBe(true)
    expect(channels[0].listeners.size).toBe(0)
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'REFRESH_INVALID' } }, 401))
    const second = hook()
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    await act(async () => pending.resolve(response({ data: user })))
    expect(second.result.current.user).toBeNull()
    expect(second.result.current.token).toBeNull()
  })
})
