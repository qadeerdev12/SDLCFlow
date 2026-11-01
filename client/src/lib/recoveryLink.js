let initialToken = ''

export function recoveryTokenFromHash(hash) {
  const values = new URLSearchParams(hash.slice(1)).getAll('token')
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : ''
}

// Called before BrowserRouter mounts, so its history state never retains the
// secret. Never accept query tokens, store them, or forward a returnTo parameter.
export function captureRecoveryLink(location = window.location, history = window.history) {
  initialToken = ''
  if (location.pathname !== '/reset-password') return
  const token = recoveryTokenFromHash(location.hash)
  // Fail closed if history cannot be scrubbed. A refresh after scrubbing requires
  // reopening the original email link; persistence would re-expose the secret.
  try {
    history.replaceState(history.state, '', location.pathname)
    initialToken = token
  } catch { initialToken = '' }
}

// Read without consuming during render: StrictMode may call initializers twice.
export const readRecoveryToken = () => initialToken
export const clearRecoveryToken = () => { initialToken = '' }
