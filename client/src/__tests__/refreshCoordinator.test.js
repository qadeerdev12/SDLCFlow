import { describe, expect, it, vi } from 'vitest'
import { createRefreshCoordinator } from '../lib/refreshCoordinator'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
function environment() {
  const values = new Map(), channels = new Set()
  let tail = Promise.resolve()
  const locks = { request: vi.fn((name, options, callback) => {
    const next = tail.then(callback)
    tail = next.catch(() => {})
    return next
  }) }
  const storage = {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
  }
  const sent = []
  const createChannel = () => {
    const listeners = new Set()
    const channel = {
      addEventListener: (name, callback) => listeners.add(callback),
      removeEventListener: (name, callback) => listeners.delete(callback),
      close: vi.fn(() => channels.delete(channel)),
      postMessage: (data) => {
        sent.push(data)
        // Delivery is asynchronous, just like the browser API.
        for (const other of channels) if (other !== channel) queueMicrotask(() => other.receive(data))
      },
      receive: (data) => listeners.forEach((callback) => callback({ data })),
    }
    channels.add(channel)
    return channel
  }
  return { locks, storage, createChannel, sent, values, channels }
}
function response(data = access(), status = 200) {
  return { ok: status >= 200 && status < 300, status,
    headers: { get: () => 'application/json' }, json: async () => status < 300 ? { data } : { error: data } }
}
const access = () => ({ token: 'private-access-token', expiresAt: new Date(Date.now() + 900000).toISOString() })
const setup = (options = {}) => {
  const env = environment()
  const fetchImpl = vi.fn().mockResolvedValue(response())
  const onResult = vi.fn()
  const coordinator = createRefreshCoordinator({ ...env, baseUrl: 'https://api.example.com/api/v1', fetchImpl, onResult, ...options })
  return { ...env, fetchImpl, onResult, coordinator }
}

describe('dormant cookie-auth coordinator', () => {
  it('shares one refresh promise across callers and includes the cookie/CSRF contract', async () => {
    const ctx = setup()
    const first = ctx.coordinator.refresh(), second = ctx.coordinator.refresh()
    expect(first).toBe(second)
    await first
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1)
    expect(ctx.fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/refresh', {
      method: 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', body: '{}',
      headers: { 'Content-Type': 'application/json', 'X-SDLCFlow-CSRF': '1' },
    })
    expect(ctx.onResult).toHaveBeenCalledTimes(1)
    await ctx.coordinator.refresh()
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(2)
    ctx.coordinator.dispose()
  })

  it('holds the cross-tab lock through response parsing and local result handling', async () => {
    const env = environment(), reading = deferred(), started = deferred()
    const order = []
    const fetchImpl = vi.fn().mockImplementationOnce(async () => ({
      ...response(), json: async () => { started.resolve(); await reading.promise; return { data: access() } },
    })).mockResolvedValue(response())
    const a = createRefreshCoordinator({ ...env, fetchImpl, onResult: () => order.push('applied') })
    const b = createRefreshCoordinator({ ...env, fetchImpl })
    const first = a.refresh()
    await started.promise
    const second = b.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    reading.resolve()
    await first
    await second
    expect(order).toEqual(['applied'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(env.locks.request.mock.calls.map(([name]) => name)).toEqual(['sdlcflow:cookie-auth:v1', 'sdlcflow:cookie-auth:v1'])
    a.dispose(); b.dispose()
  })

  it('rejects queued refresh after an account-change revision, even without broadcast delivery', async () => {
    const env = environment(), gate = deferred(), started = deferred()
    // Simulate delayed/dropped notifications; correctness still uses the revision.
    env.createChannel = () => ({ addEventListener() {}, removeEventListener() {}, close() {}, postMessage() {} })
    const fetchImpl = vi.fn().mockImplementationOnce(async () => { started.resolve(); await gate.promise; return response() })
    const a = createRefreshCoordinator({ ...env, fetchImpl })
    const b = createRefreshCoordinator({ ...env, fetchImpl })
    // Hold the lock before either operation so both capture the old revision.
    const held = deferred()
    const blocker = env.locks.request('sdlcflow:cookie-auth:v1', {}, () => held.promise)
    const login = a.mutate('login', { body: { email: 'test@example.com', password: 'secret-password' } })
    const refresh = expect(b.refresh()).rejects.toMatchObject({ code: 'AUTH_OPERATION_STALE' })
    held.resolve(); await blocker
    await started.promise
    gate.resolve()
    await login; await refresh
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    a.dispose(); b.dispose()
  })

  it('suppresses an in-flight refresh result when local logout is requested', async () => {
    const gate = deferred(), started = deferred()
    const ctx = setup()
    ctx.fetchImpl.mockImplementationOnce(async () => { started.resolve(); await gate.promise; return response() })
      .mockResolvedValueOnce(response({ loggedOut: true }))
    const refresh = expect(ctx.coordinator.refresh()).rejects.toMatchObject({ code: 'AUTH_OPERATION_STALE' })
    await started.promise
    const logout = ctx.coordinator.mutate('logout')
    gate.resolve()
    await refresh; await logout
    expect(ctx.onResult.mock.calls.map(([value]) => value.action)).toEqual(['logout'])
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(2)
    ctx.coordinator.dispose()
  })

  it('stores/broadcasts no tokens, passwords or user details', async () => {
    const ctx = setup()
    await ctx.coordinator.mutate('login', { body: { email: 'private@example.com', password: 'secret-password' } })
    const persisted = JSON.stringify([...ctx.values.entries(), ctx.sent])
    for (const secret of ['private-access-token', 'secret-password', 'private@example.com']) expect(persisted).not.toContain(secret)
    expect(Object.keys(ctx.sent[0]).sort()).toEqual(['revision', 'type'])
    ctx.coordinator.dispose()
  })

  it('notifies another tab without forwarding access data', async () => {
    const env = environment(), onSessionChange = vi.fn()
    const a = createRefreshCoordinator({ ...env, fetchImpl: vi.fn().mockResolvedValue(response()) })
    const b = createRefreshCoordinator({ ...env, onSessionChange })
    await a.mutate('login')
    expect(onSessionChange).toHaveBeenCalledWith({ type: 'session-changed' })
    a.dispose(); b.dispose()
  })

  it('blocks refresh across tabs after a lost response, and a fresh login clears recovery', async () => {
    const env = environment()
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError('Network failed')).mockResolvedValue(response())
    const a = createRefreshCoordinator({ ...env, fetchImpl })
    const b = createRefreshCoordinator({ ...env, fetchImpl })
    await expect(a.refresh()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    await expect(b.refresh()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await b.mutate('login')
    await a.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    a.dispose(); b.dispose()
  })

  it.each(['REFRESH_INVALID', 'REFRESH_REUSED', 'REFRESH_EXHAUSTED'])('blocks subsequent refresh for terminal %s', async (code) => {
    const ctx = setup()
    ctx.fetchImpl.mockResolvedValue(response({ code, message: 'Please sign in.' }, 401))
    await expect(ctx.coordinator.refresh()).rejects.toMatchObject({ code, status: 401 })
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1)
    ctx.coordinator.dispose()
  })

  it('preserves rate-limit metadata without automatically retrying', async () => {
    const ctx = setup()
    ctx.fetchImpl.mockResolvedValueOnce(response({ code: 'AUTH_RATE_LIMITED', retryAfter: 90, resetAt: 'later' }, 429))
    await expect(ctx.coordinator.refresh()).rejects.toMatchObject({ status: 429, retryAfter: 90, resetAt: 'later' })
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1)
    await ctx.coordinator.refresh() // Explicit later retry, never an automatic loop.
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(2)
    ctx.coordinator.dispose()
  })

  it.each([response({}, 503), response({ token: 'bad', expiresAt: 'invalid' }),
    { ...response(), headers: { get: () => 'text/html' } }])('does not retry uncertain or malformed responses', async (reply) => {
    const ctx = setup()
    ctx.fetchImpl.mockResolvedValue(reply)
    await expect(ctx.coordinator.refresh()).rejects.toBeInstanceOf(Error)
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_RECOVERY_REQUIRED')
    expect(ctx.fetchImpl).toHaveBeenCalledTimes(1)
    ctx.coordinator.dispose()
  })

  it.each([{ locks: null }, { storage: null }, { createChannel: () => { throw new Error() } }])('fails closed without required capabilities', async (options) => {
    const ctx = setup(options)
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_COORDINATION_UNAVAILABLE')
    expect(ctx.fetchImpl).not.toHaveBeenCalled()
    ctx.coordinator.dispose()
  })

  it('does not send if coordination storage cannot be written', async () => {
    const ctx = setup()
    ctx.storage.setItem.mockImplementation(() => { throw new Error('Storage disabled') })
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_COORDINATION_UNAVAILABLE')
    expect(ctx.fetchImpl).not.toHaveBeenCalled()
    ctx.coordinator.dispose()
  })

  it('disposal suppresses pending results and closes its channel', async () => {
    const gate = deferred(), started = deferred()
    const ctx = setup()
    ctx.fetchImpl.mockImplementationOnce(async () => { started.resolve(); await gate.promise; return response() })
    const pending = expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_COORDINATOR_DISPOSED')
    await started.promise
    ctx.coordinator.dispose()
    gate.resolve()
    await pending
    expect(ctx.onResult).not.toHaveBeenCalled()
    expect(ctx.channels.size).toBe(0)
    await expect(ctx.coordinator.refresh()).rejects.toHaveProperty('code', 'AUTH_COORDINATOR_DISPOSED')
  })

  it.each([['password', 'PATCH', 'password'], ['logoutAll', 'POST', 'logout-all'], ['deleteAccount', 'DELETE', 'me']])('serializes %s using the correct method and bearer token', async (action, method, path) => {
    const ctx = setup()
    ctx.fetchImpl.mockResolvedValue(response({ updated: true, deleted: true, loggedOut: true }))
    await ctx.coordinator.mutate(action, { token: 'bearer-secret', body: { password: 'secret' } })
    expect(ctx.fetchImpl.mock.calls[0][0]).toBe(`https://api.example.com/api/v1/auth/${path}`)
    expect(ctx.fetchImpl.mock.calls[0][1]).toMatchObject({ method, headers: { Authorization: 'Bearer bearer-secret' } })
    ctx.coordinator.dispose()
  })
})
