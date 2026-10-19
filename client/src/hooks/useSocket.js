import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { isSessionError, reportSessionFailure } from '../lib/sessionEvents'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5050'

// Owns the Socket.IO client lifecycle for authenticated areas. Components get
// small helpers instead of the raw socket ref, which keeps React render logic
// separate from imperative socket APIs.
export function useSocket(token) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')

  useEffect(() => {
    if (!token) return undefined

    const socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: true,
      reconnection: true,
    })

    socketRef.current = socket
    let active = true
    let retryTimer
    let retryDelay = 3000
    const endSession = (code) => {
      if (!active || !isSessionError(code)) return
      clearTimeout(retryTimer)
      socket.disconnect() // Stop reconnect attempts with credentials known to be invalid.
      reportSessionFailure(token, code)
    }
    socket.on('session:invalidated', ({ code } = {}) => endSession(code))

    socket.on('connect', () => {
      clearTimeout(retryTimer)
      retryDelay = 3000
      setConnected(true)
      setConnectionError('')
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', (err) => {
      setConnected(false)
      setConnectionError(err.message || 'Could not connect to realtime server.')
      endSession(err.data?.code)
      if (err.data?.code === 'AUTH_UNAVAILABLE') {
        // Server-denied handshakes are not automatically retried by Socket.IO.
        clearTimeout(retryTimer)
        retryTimer = setTimeout(() => { if (active) socket.connect() }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30000)
      }
    })

    return () => {
      active = false
      clearTimeout(retryTimer)
      socket.removeAllListeners()
      socket.disconnect()
      setConnected(false)
      socketRef.current = null
    }
  }, [token])

  const emitWithAck = useCallback((eventName, payload) => {
    const socket = socketRef.current
    if (!socket?.connected) {
      return Promise.reject(new Error('Realtime connection is not available.'))
    }

    return new Promise((resolve, reject) => {
      // All server mutations use ack callbacks. The Promise wrapper gives page
      // code normal async/await control flow and one place for timeout handling.
      socket.timeout(8000).emit(eventName, payload, (err, response) => {
        if (err) {
          reject(new Error('Realtime request timed out.'))
          return
        }
        if (!response?.ok) {
          if (isSessionError(response?.error?.code)) socket.disconnect()
          reportSessionFailure(socket.auth?.token, response?.error?.code)
          reject(new Error(response?.error?.message || 'Realtime request failed.'))
          return
        }
        resolve(response.data)
      })
    })
  }, [])

  const onSocketEvent = useCallback((eventName, handler) => {
    const socket = socketRef.current
    if (!socket) return () => {}

    // Returning the cleanup keeps board pages from accumulating duplicate
    // listeners when navigating between boards or reconnecting.
    socket.on(eventName, handler)
    return () => socket.off(eventName, handler)
  }, [])

  return {
    connected,
    connectionError,
    emitWithAck,
    onSocketEvent,
  }
}
