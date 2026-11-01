import { recoveryTokenFromHash } from './recoveryLink'

let initialToken = ''

// Separate purpose vaults prevent a reset page from reusing verification proof.
// Read without consuming for StrictMode; never persist proof in router/storage.
export function captureVerificationLink(location = window.location, history = window.history) {
  initialToken = ''
  if (location.pathname !== '/verify-email') return
  const token = recoveryTokenFromHash(location.hash)
  try {
    history.replaceState(history.state, '', location.pathname)
    initialToken = token
  } catch { initialToken = '' }
}
export const readVerificationToken = () => initialToken
export const clearVerificationToken = () => { initialToken = '' }
