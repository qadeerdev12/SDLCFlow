import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import { useSocket } from '../hooks/useSocket'
import { onSessionFailure } from '../lib/sessionEvents'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
let sockets, failures, stop
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
      receive: (event, payload) => { if (event === 'connect') socket.connected = true; handlers.get(event)?.(payload) },
    }
    sockets.push(socket)
    return socket
  })
})
afterEach(() => { cleanup(); stop(); vi.clearAllMocks(); vi.useRealTimers() })

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
