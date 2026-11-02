const listeners = new Set()

// Authorization is separate from session failure. Keep credentials in memory
// and include the originating token so an old account cannot block a new one.
export function reportVerificationRequired(token, code) {
  if (!token || code !== 'EMAIL_VERIFICATION_REQUIRED') return
  for (const listener of listeners) listener({ token })
}

export function onVerificationRequired(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
