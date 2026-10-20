import { useEffect, useRef, useState } from 'react'
import { AuthContext } from './authContextValue'
import { authApi } from '../lib/api'
import { createRefreshCoordinator } from '../lib/refreshCoordinator'
import { isSessionError, onSessionFailure } from '../lib/sessionEvents'

const emptySession = { user: null, token: null, expiresAt: null, loading: true,
  authError: '', sessionMessage: '', needsSignIn: false }
const validUser = (user) => user && typeof user.id === 'string' && typeof user.name === 'string'

/** Opt-in migration provider. It never reads/writes stored credentials. Keep it
 * separate from the legacy provider so hooks and side effects cannot mix modes.
 */
export function MemoryAuthProvider({ children }) {
  const [session, setSession] = useState(emptySession)
  const actionsRef = useRef(null)

  useEffect(() => {
    // One effect lifetime owns one coordinator. StrictMode cleanup invalidates
    // the first lifetime before queued requests can apply to its replacement.
    let active = true, version = 0, token = null, user = null, needsSignIn = false
    let retryAt = 0
    const update = (patch) => {
      if (!active) return
      if ('token' in patch) token = patch.token
      if ('user' in patch) user = patch.user
      if ('needsSignIn' in patch) needsSignIn = patch.needsSignIn
      setSession((current) => ({ ...current, ...patch }))
    }
    const current = (expected) => active && version === expected
    const clear = (message = '') => {
      version++
      coordinator.invalidate()
      update({ ...emptySession, loading: false, sessionMessage: message })
    }

    async function loadUser(expectedToken, expectedVersion) {
      try {
        const response = await authApi.getMe(expectedToken)
        if (!current(expectedVersion) || token !== expectedToken) return
        const nextUser = response.data?.user ?? response.data
        if (!validUser(nextUser)) throw new Error('Invalid user response')
        update({ user: nextUser, loading: false, authError: '', needsSignIn: false })
      } catch (error) {
        if (!current(expectedVersion) || token !== expectedToken) return
        if (isSessionError(error.code)) clear('Your session ended. Please sign in again.')
        else update({ loading: false, authError: 'Could not check your session. Please try again.' })
      }
    }

    const coordinator = createRefreshCoordinator({
      onResult({ action, data }) {
        if (!active) return
        if (!['refresh', 'login', 'register'].includes(action)) { clear(); return }
        const nextVersion = ++version
        retryAt = 0
        const nextUser = validUser(data.user) ? data.user : null
        // Commit the token synchronously while the cookie lock is held. /me is
        // read-only and runs outside the cookie lifecycle, guarded by version.
        update({ token: data.token, expiresAt: data.expiresAt, user: nextUser,
          loading: !nextUser, authError: '', sessionMessage: '', needsSignIn: false })
        if (!nextUser) void loadUser(data.token, nextVersion)
      },
      onSessionChange({ type }) {
        if (!active) return
        clear()
        // No automatic cross-tab refresh loop. An explicit retry can adopt a
        // changed cookie; ambiguous cookie changes require a fresh sign-in.
        update({ authError: type === 'recovery-required'
          ? 'Your session changed in another tab. Please sign in again.'
          : 'Your session changed in another tab. Check your session to continue.',
        needsSignIn: type === 'recovery-required' })
      },
    })

    function failed(error, expectedVersion) {
      if (!current(expectedVersion)) return
      if (error.code === 'AUTH_COORDINATOR_DISPOSED') return
      if (['REFRESH_INVALID', 'REFRESH_REUSED', 'REFRESH_EXHAUSTED'].includes(error.code)) {
        clear('Your session ended. Please sign in again.')
        return
      }
      const recovery = error.recoveryRequired || error.code === 'AUTH_RECOVERY_REQUIRED'
      if (Number.isFinite(error.retryAfter) && error.retryAfter > 0) retryAt = Date.now() + error.retryAfter * 1000
      update({ loading: false, needsSignIn: Boolean(recovery), authError: recovery
        ? 'Could not safely restore your session. Please sign in again.'
        : error.message || 'Could not check your session. Please try again.' })
    }

    async function restore() {
      if (!active) return
      const expectedVersion = ++version
      update({ loading: true, authError: '' })
      try { await coordinator.refresh() } catch (error) { failed(error, expectedVersion) }
    }

    async function mutate(action, body = {}) {
      const expectedVersion = ++version // Invalidate an outstanding /me immediately.
      update({ authError: '', sessionMessage: '' })
      try {
        return await coordinator.mutate(action, { body, token })
      } catch (error) {
        failed(error, expectedVersion)
        throw error // Login forms must not navigate as though a failed login succeeded.
      }
    }

    const actions = {
      login: (email, password) => mutate('login', { email, password }),
      register: (name, email, password) => mutate('register', { name, email, password }),
      logout: (expectedToken = token) => expectedToken === token ? mutate('logout') : Promise.resolve(),
      retrySession: async () => {
        if (!active || needsSignIn || Date.now() < retryAt) return
        if (token) {
          const expectedVersion = ++version
          update({ loading: !user, authError: '' })
          await loadUser(token, expectedVersion)
        } else await restore()
      },
      updateUser: (updates) => { if (user) update({ user: { ...user, ...updates } }) },
    }
    actionsRef.current = actions
    const unsubscribe = onSessionFailure(({ token: failedToken }) => {
      if (active && token && failedToken === token) clear('Your session ended. Please sign in again.')
    })
    void restore()
    return () => {
      active = false
      version++
      unsubscribe()
      coordinator.dispose()
      if (actionsRef.current === actions) actionsRef.current = null
    }
  }, [])

  const invoke = (action, ...args) => {
    if (!actionsRef.current) return Promise.reject(new Error('Authentication is not ready.'))
    return actionsRef.current[action](...args)
  }
  return <AuthContext.Provider value={{ ...session,
    login: (...args) => invoke('login', ...args), register: (...args) => invoke('register', ...args),
    logout: (...args) => invoke('logout', ...args), retrySession: () => invoke('retrySession'),
    updateUser: (updates) => invoke('updateUser', updates),
  }}>{children}</AuthContext.Provider>
}
