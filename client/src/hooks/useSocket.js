import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5050'

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

    socket.on('connect', () => {
      setConnected(true)
      setConnectionError('')
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('connect_error', (err) => {
      setConnected(false)
      setConnectionError(err.message || 'Could not connect to realtime server.')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  const emitWithAck = useCallback((eventName, payload) => {
    const socket = socketRef.current
    if (!socket?.connected) {
      return Promise.reject(new Error('Realtime connection is not available.'))
    }

    return new Promise((resolve, reject) => {
      socket.timeout(8000).emit(eventName, payload, (err, response) => {
        if (err) {
          reject(new Error('Realtime request timed out.'))
          return
        }
        if (!response?.ok) {
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
