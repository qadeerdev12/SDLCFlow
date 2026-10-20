import { useEffect, useRef, useState } from 'react'
import { AuthContext } from './authContextValue'
import { authApi } from '../lib/api'
import { createRefreshCoordinator } from '../lib/refreshCoordinator'
import { isSessionError, onSessionFailure } from '../lib/sessionEvents'
import { registerSessionRenewal } from '../lib/sessionRenewal'

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
    let familyEpoch = 0, transitioning = false, expiresAt = null
    let endingMutation = null
    const issuedTokens = new Set()
    const update = (patch) => {
      if (!active) return
      if ('token' in patch) token = patch.token
      if ('user' in patch) user = patch.user
      if ('needsSignIn' in patch) needsSignIn = patch.needsSignIn
      if ('expiresAt' in patch) expiresAt = patch.expiresAt
      setSession((current) => ({ ...current, ...patch }))
    }
    const current = (expected) => active && version === expected
    const clear = (message = '', invalidate = true) => {
      version++
      familyEpoch++
      transitioning = false
      issuedTokens.clear()
      if (invalidate) coordinator.invalidate()
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
        else if (error.recoveryRequired || error.code === 'AUTH_RECOVERY_REQUIRED') failed(error, expectedVersion)
        else update({ loading: false, authError: 'Could not check your session. Please try again.' })
      }
    }

    const coordinator = createRefreshCoordinator({
      onResult({ action, data }) {
        if (!active) return
        if (!['refresh', 'login', 'register'].includes(action)) { clear(); return }
        const nextVersion = ++version
        retryAt = 0
        if (action !== 'refresh') issuedTokens.clear()
        issuedTokens.add(data.token)
        // Bound memory while retaining recent tokens for delayed expiry replies.
        if (issuedTokens.size > 32) issuedTokens.delete(issuedTokens.values().next().value)
        // Same-family renewal retains identity instead of showing bootstrap loading.
        const nextUser = validUser(data.user) ? data.user : action === 'refresh' ? user : null
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
      // Protected account actions need a current bearer as well as the cookie.
      // Renew before starting their mutation; never blindly replay a mutation.
      if (['password', 'logoutAll', 'deleteAccount'].includes(action)) {
        if (!token) throw Object.assign(new Error('Please sign in again.'), { code: 'AUTH_OPERATION_STALE' })
        if (Date.parse(expiresAt) <= Date.now()) {
          const expectedFamily = familyEpoch
          const renewedToken = await renew(token)
          if (familyEpoch !== expectedFamily || token !== renewedToken || !active) {
            throw Object.assign(new Error('Session changed before account action.'), { code: 'AUTH_OPERATION_STALE' })
          }
        }
      }
      const expectedVersion = ++version // Invalidate an outstanding /me immediately.
      const expectedEpoch = ++familyEpoch
      const ending = ['logout', 'password', 'logoutAll', 'deleteAccount'].includes(action)
      const operation = ending ? { epoch: expectedEpoch } : null
      endingMutation = operation
      transitioning = true
      update({ authError: '', sessionMessage: '' })
      try {
        return await coordinator.mutate(action, { body, token })
      } catch (error) {
        if (current(expectedVersion) && isSessionError(error.code) && error.code !== 'SESSION_EXPIRED') {
          clear('Your session ended. Please sign in again.')
        } else failed(error, expectedVersion)
        throw error // Login forms must not navigate as though a failed login succeeded.
      } finally {
        if (endingMutation === operation) endingMutation = null
        if (familyEpoch === expectedEpoch) transitioning = false
      }
    }

    async function renew(expiredToken) {
      if (!active || transitioning || !token || !issuedTokens.has(expiredToken)) {
        throw Object.assign(new Error('Session changed before renewal.'), { code: 'AUTH_OPERATION_STALE' })
      }
      if (needsSignIn) throw Object.assign(new Error('Please sign in again.'), { code: 'AUTH_RECOVERY_REQUIRED' })
      if (Date.now() < retryAt) throw Object.assign(new Error('Please wait before renewing your session.'), {
        code: 'AUTH_RATE_LIMITED', retryAfter: Math.ceil((retryAt - Date.now()) / 1000),
      })
      // Another caller may already have renewed this family's token. Never use
      // a new account's token to replay an old account's request.
      if (token !== expiredToken && Date.parse(expiresAt) > Date.now()) return token
      const expectedEpoch = familyEpoch, expectedVersion = version
      try {
        const data = await coordinator.refresh()
        if (!active || familyEpoch !== expectedEpoch || transitioning || token !== data.token) {
          throw Object.assign(new Error('Session changed during renewal.'), { code: 'AUTH_OPERATION_STALE' })
        }
        return data.token
      } catch (error) {
        failed(error, expectedVersion)
        throw error
      }
    }

    const actions = {
      login: (email, password) => mutate('login', { email, password }),
      register: (name, email, password) => mutate('register', { name, email, password }),
      logout: (expectedToken = token) => expectedToken === token ? mutate('logout') : Promise.resolve(),
      updatePassword: (currentPassword, newPassword) => mutate('password', { currentPassword, newPassword }),
      logoutEverywhere: () => mutate('logoutAll'),
      deleteAccount: (password) => mutate('deleteAccount', { password }),
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
      if (active && token && failedToken === token) {
        // Our account action can revoke sockets before its HTTP response arrives.
        // Clear private state immediately but let that action receive confirmation.
        const awaitingConfirmation = endingMutation?.epoch === familyEpoch
        clear('Your session ended. Please sign in again.', !awaitingConfirmation)
      }
    })
    const unregisterRenewal = registerSessionRenewal({ renew,
      isCurrent: (candidate) => active && !transitioning && token === candidate && issuedTokens.has(candidate),
    })
    void restore()
    return () => {
      active = false
      version++
      unsubscribe()
      unregisterRenewal()
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
    updatePassword: (...args) => invoke('updatePassword', ...args),
    logoutEverywhere: () => invoke('logoutEverywhere'),
    deleteAccount: (...args) => invoke('deleteAccount', ...args),
    updateUser: (updates) => invoke('updateUser', updates),
  }}>{children}</AuthContext.Provider>
}
