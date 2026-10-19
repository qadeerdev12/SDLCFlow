const listeners = new Set()
const terminalCodes = new Set(['SESSION_INVALIDATED', 'SESSION_EXPIRED', 'INVALID_TOKEN', 'USER_NOT_FOUND', 'NO_TOKEN_PROVIDED'])

export function isSessionError(code) {
  return terminalCodes.has(code)
}

// Include the request's token so late failures cannot clear a newer login.
// Never persist or log event payloads: they contain bearer credentials.
export function reportSessionFailure(token, code) {
  if (!token || !isSessionError(code)) return
  for (const listener of listeners) listener({ token, code })
}

export function onSessionFailure(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
