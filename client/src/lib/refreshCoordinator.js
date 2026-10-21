const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050/api/v1'
const LOCK = 'sdlcflow:cookie-auth:v1'
const CHANNEL = 'sdlcflow:auth-events:v1'
const REVISION_KEY = 'sdlcflow:auth-revision:v1'
const ACTIONS = {
  login: ['login', 'POST'], register: ['register', 'POST'], logout: ['logout', 'POST'],
  password: ['password', 'PATCH'], logoutAll: ['logout-all', 'POST'], deleteAccount: ['me', 'DELETE'],
}
const ENDING = new Set(['logout', 'password', 'logoutAll', 'deleteAccount'])
const TERMINAL = new Set(['REFRESH_INVALID', 'REFRESH_REUSED', 'REFRESH_EXHAUSTED'])
const failure = (code, message) => Object.assign(new Error(message), { code })
function browserStorage() {
  try { return globalThis.localStorage } catch { return null }
}

/** Create ONE instance per tab, not per
 * component/socket. onResult must synchronously apply session state; never start
 * another coordinated request inside it (the cookie lock is still held).
 */
export function createRefreshCoordinator({
  baseUrl = API_URL, fetchImpl = (...args) => fetch(...args),
  locks = globalThis.navigator?.locks, storage = browserStorage(),
  createChannel = (name) => new BroadcastChannel(name),
  onResult = () => {}, onSessionChange = () => {},
} = {}) {
  let channel
  let disposed = false
  let generation = 0
  let pending = null
  try {
    if (locks?.request && storage?.getItem && storage?.setItem) channel = createChannel(CHANNEL)
  } catch { /* Capability checks fail closed before any network request. */ }

  function readState() {
    try {
      const raw = storage.getItem(REVISION_KEY)
      if (raw === null) return { revision: 'initial', blocked: false }
      const state = JSON.parse(raw)
      if (typeof state.revision !== 'string' || typeof state.blocked !== 'boolean') throw new Error()
      return { revision: state.revision, blocked: state.blocked }
    } catch {
      throw failure('AUTH_COORDINATION_UNAVAILABLE', 'Session coordination storage is unavailable.')
    }
  }
  function writeState(state) {
    try { storage.setItem(REVISION_KEY, JSON.stringify(state)) } catch {
      throw failure('AUTH_COORDINATION_UNAVAILABLE', 'Session coordination storage is unavailable.')
    }
  }
  function assertReady() {
    if (disposed) throw failure('AUTH_COORDINATOR_DISPOSED', 'Session coordinator is closed.')
    if (!channel) throw failure('AUTH_COORDINATION_UNAVAILABLE', 'This browser cannot coordinate secure session renewal.')
  }
  function assertCurrent(version) {
    assertReady()
    if (version !== generation) throw failure('AUTH_OPERATION_STALE', 'Session changed while this request was waiting.')
  }
  function publish(type, revision) {
    // Only a fixed event type and opaque revision cross tabs, never response data.
    channel.postMessage({ type, revision })
  }
  const receive = ({ data }) => {
    if (disposed || !['session-changed', 'recovery-required'].includes(data?.type)
      || typeof data.revision !== 'string') return
    // Broadcast delivery can lag behind a newer operation. The shared revision
    // is checked under Web Locks too; BroadcastChannel is notification, not a lock.
    try {
      if (readState().revision !== data.revision) return
    } catch {
      generation++
      onSessionChange({ type: 'recovery-required' })
      return
    }
    generation++
    onSessionChange({ type: data.type })
  }
  channel?.addEventListener('message', receive)

  async function execute(action, { body = {}, token } = {}, version) {
    assertReady()
    const snapshot = readState()
    return locks.request(LOCK, { mode: 'exclusive' }, async () => {
      assertCurrent(version)
      let state = readState()
      if (state.revision !== snapshot.revision) throw failure('AUTH_OPERATION_STALE', 'Session changed in another tab.')
      if (action === 'refresh' && state.blocked) {
        throw failure('AUTH_RECOVERY_REQUIRED', 'Sign in again before renewing this session.')
      }
      // This is a revision marker, NOT a home-grown localStorage mutex. Only the
      // browser lock serializes cookie writes; the marker rejects stale intent.
      if (action !== 'refresh') state = { ...state, revision: crypto.randomUUID() }
      writeState(state) // Verify writable coordination storage before sending.
      const [path, method] = action === 'refresh' ? ['refresh', 'POST'] : ACTIONS[action]
      const headers = { 'Content-Type': 'application/json', 'X-SDLCFlow-CSRF': '1' }
      if (token) headers.Authorization = `Bearer ${token}`
      let response, payload
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/auth/${path}`, {
          method, headers, body: JSON.stringify(body), credentials: 'include',
          cache: 'no-store', redirect: 'error',
        })
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error()
        payload = await response.json()
      } catch {
        // A request may have committed even when its response is lost. Persist a
        // non-secret stop marker so queued tabs cannot blindly rotate again.
        writeState({ ...state, blocked: true })
        if (!disposed) publish('recovery-required', state.revision)
        throw failure('AUTH_RECOVERY_REQUIRED', 'Session response was lost. Sign in again; do not retry automatically.')
      }
      if (!response.ok) {
        const recoveryRequired = response.status >= 500 || TERMINAL.has(payload?.error?.code)
        if (recoveryRequired) {
          writeState({ ...state, blocked: true })
          if (!disposed) publish('recovery-required', state.revision)
        }
        const error = failure(payload?.error?.code || 'AUTH_REQUEST_FAILED', payload?.error?.message || 'Session request failed.')
        Object.assign(error, { status: response.status, recoveryRequired, retryAfter: payload?.error?.retryAfter,
          resetAt: payload?.error?.resetAt })
        throw error
      }
      const data = payload?.data
      const grantsAccess = ['refresh', 'login', 'register'].includes(action)
      const confirmation = action === 'password' ? 'updated' : action === 'deleteAccount' ? 'deleted' : 'loggedOut'
      if ((grantsAccess && (typeof data?.token !== 'string' || !data.token
        || typeof data.expiresAt !== 'string' || !(Date.parse(data.expiresAt) > Date.now())))
        || (!grantsAccess && data?.[confirmation] !== true)) {
        writeState({ ...state, blocked: true })
        if (!disposed) publish('recovery-required', state.revision)
        throw failure('AUTH_RECOVERY_REQUIRED', 'Session response was invalid. Please sign in again.')
      }
      if (action !== 'refresh') {
        writeState({ ...state, blocked: ENDING.has(action) })
        if (!disposed) publish('session-changed', state.revision)
      }
      assertCurrent(version)
      onResult({ action, data })
      return data
    })
  }

  function refresh() {
    if (pending?.version === generation) return pending.promise
    const version = generation
    const promise = execute('refresh', {}, version)
    const entry = { version, promise }
    pending = entry
    // Both branches handle cleanup without creating an unhandled rejection.
    const clear = () => { if (pending === entry) pending = null }
    promise.then(clear, clear)
    return promise
  }
  function mutate(action, options) {
    if (!Object.hasOwn(ACTIONS, action)) return Promise.reject(failure('AUTH_ACTION_INVALID', 'Unknown authentication action.'))
    // Cancel local refresh results immediately, even while this mutation waits.
    generation++
    return execute(action, options, generation)
  }
  return {
    refresh, mutate,
    invalidate() { generation++ },
    dispose() {
      disposed = true
      generation++
      channel?.removeEventListener('message', receive)
      channel?.close()
    },
  }
}
