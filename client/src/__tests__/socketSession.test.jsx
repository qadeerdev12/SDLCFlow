// Tests socket authentication lifecycle through a controllable Socket.IO double.
// Expiry may renew credentials, but mutation acknowledgements must not cause an
// automatic replay; replaced sockets and cleanup must suppress stale callbacks.

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { useSocket } from '../hooks/useSocket'
import { onSessionFailure } from '../lib/sessionEvents'
import { registerSessionRenewal } from '../lib/sessionRenewal'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
let sockets, failures, stop, unregister
// receive() injects server events and ack captures a pending mutation reply.
// Keeping old doubles lets tests deliver late callbacks after token replacement.
beforeEach(() => {
  sockets = []
  failures = vi.fn()
  stop = onSessionFailure(failures)
  io.mockImplementation((url, options) => {
    const handlers = new Map()
    const socket = {
      auth: options.auth, connected: false,
      on: (event, handler) => { handlers.set(event, handler) },
      off: (event) => handlers.delete(event),
      removeAllListeners: () => handlers.clear(),
      disconnect: vi.fn(() => { socket.connected = false; handlers.get('disconnect')?.() }),
      connect: vi.fn(),
      timeout: () => socket,
      emit: vi.fn((event, payload, callback) => { socket.ack = callback }),
      receive: (event, payload) => { if (event === 'connect') socket.connected = true; handlers.get(event)?.(payload) },
    }
    sockets.push(socket)
    return socket
  })
})
afterEach(() => { cleanup(); stop(); unregister?.(); unregister = null; vi.clearAllMocks(); vi.useRealTimers() })

it.each(['connect_error', 'session:invalidated'])('renews %s expiry once and replaces the socket on token change', async (event) => {
  const renew = vi.fn(async () => 'new')
  unregister = registerSessionRenewal({ renew, isCurrent: () => true })
  const { rerender } = renderHook(({ token }) => useSocket(token), { initialProps: { token: 'old' } })
  await act(async () => {
    const payload = event === 'connect_error' ? { data: { code: 'SESSION_EXPIRED' } } : { code: 'SESSION_EXPIRED' }
    sockets[0].receive(event, payload)
    sockets[0].receive(event, payload)
  })
  expect(renew).toHaveBeenCalledExactlyOnceWith('old')
  expect(failures).not.toHaveBeenCalled()
  rerender({ token: 'new' })
  expect(sockets[1].auth.token).toBe('new')
  expect(sockets[0].connect).not.toHaveBeenCalled()
})

// Renewal repairs future connectivity, not the outcome of an already submitted
// command. Replaying here could create the same task twice.
it('renews an expired acknowledgement without replaying the mutation', async () => {
  const renew = vi.fn(async () => 'new')
  unregister = registerSessionRenewal({ renew, isCurrent: () => true })
  const { result } = renderHook(() => useSocket('old'))
  act(() => sockets[0].receive('connect'))
  await act(async () => {
    const request = result.current.emitWithAck('card:create', { title: 'Task' })
    const rejected = expect(request).rejects.toHaveProperty('code', 'SESSION_EXPIRED')
    sockets[0].ack(null, { ok: false, error: { code: 'SESSION_EXPIRED' } })
    await rejected
  })
  expect(renew).toHaveBeenCalledExactlyOnceWith('old')
  expect(sockets[0].emit).toHaveBeenCalledTimes(1)
})

it('does not renew or replay timed-out events, or act on a replaced socket acknowledgement', async () => {
  const renew = vi.fn()
  unregister = registerSessionRenewal({ renew, isCurrent: () => true })
  const { result, rerender } = renderHook(({ token }) => useSocket(token), { initialProps: { token: 'old' } })
  act(() => sockets[0].receive('connect'))
  const request = result.current.emitWithAck('card:create', {})
  sockets[0].ack(new Error('Timeout'))
  await expect(request).rejects.toThrow('timed out')
  const oldRequest = result.current.emitWithAck('card:create', {})
  rerender({ token: 'new' })
  sockets[0].ack(null, { ok: false, error: { code: 'SESSION_INVALIDATED' } })
  await expect(oldRequest).rejects.toHaveProperty('code', 'SESSION_INVALIDATED')
  expect(renew).not.toHaveBeenCalled()
  expect(failures).not.toHaveBeenCalled()
  expect(sockets[0].emit).toHaveBeenCalledTimes(2)
})

it.each(['SESSION_INVALIDATED', 'SESSION_EXPIRED', 'USER_NOT_FOUND'])('stops the connection and reports %s', (code) => {
  renderHook(() => useSocket('token'))
  act(() => sockets[0].receive('session:invalidated', { code }))
  expect(sockets[0].disconnect).toHaveBeenCalledTimes(1)
  expect(failures).toHaveBeenCalledWith({ token: 'token', code })
})

it('handles stale-token reconnect rejection without treating network errors as logout', () => {
  renderHook(() => useSocket('token'))
  act(() => sockets[0].receive('connect_error', new Error('Network unavailable')))
  expect(failures).not.toHaveBeenCalled()
  act(() => sockets[0].receive('connect_error', { message: 'Temporary', data: { code: 'AUTH_UNAVAILABLE' } }))
  expect(failures).not.toHaveBeenCalled()
  act(() => sockets[0].receive('connect_error', { message: 'Invalid token', data: { code: 'INVALID_TOKEN' } }))
  expect(failures).toHaveBeenCalledWith({ token: 'token', code: 'INVALID_TOKEN' })
  expect(sockets[0].disconnect).toHaveBeenCalledTimes(1)
})

it('removes old socket listeners after changing tokens', () => {
  const { rerender, unmount } = renderHook(({ token }) => useSocket(token), { initialProps: { token: 'old' } })
  rerender({ token: 'new' })
  act(() => sockets[0].receive('session:invalidated', { code: 'SESSION_INVALIDATED' }))
  expect(failures).not.toHaveBeenCalled()
  unmount()
  expect(sockets[0].disconnect).toHaveBeenCalledTimes(1)
  expect(sockets[1].disconnect).toHaveBeenCalledTimes(1)
})

it('retries temporary authentication outages and cancels retries on cleanup', () => {
  vi.useFakeTimers()
  const { unmount } = renderHook(() => useSocket('token'))
  act(() => sockets[0].receive('connect_error', { message: 'Temporary', data: { code: 'AUTH_UNAVAILABLE' } }))
  act(() => vi.advanceTimersByTime(3000))
  expect(sockets[0].connect).toHaveBeenCalledTimes(1)
  act(() => sockets[0].receive('connect_error', { message: 'Temporary', data: { code: 'AUTH_UNAVAILABLE' } }))
  unmount()
  act(() => vi.advanceTimersByTime(30000))
  expect(sockets[0].connect).toHaveBeenCalledTimes(1)
  expect(failures).not.toHaveBeenCalled()
})
