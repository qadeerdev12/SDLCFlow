import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import RecoveryLayout from '../components/RecoveryLayout'
import { useAuth } from '../context/useAuth'
import { newPasswordError, PASSWORD_HELP } from '../lib/passwordPolicy'
import { readRecoveryToken, clearRecoveryToken, recoveryTokenFromHash } from '../lib/recoveryLink'
import { recoveryRetryAt } from '../lib/passwordRecovery'
import { useRetryCooldown } from '../hooks/useRetryCooldown'

export default function ResetPasswordPage() {
  const { hash } = useLocation()
  const [entry, setEntry] = useState({ hash, id: 0 })
  // An email reopened in this tab may be hash-only navigation, not a page load.
  // Remount for new incoming links, but not for our own fragment scrubbing.
  // Isolating each form also prevents late results updating a newer link's form.
  if (entry.hash !== hash) setEntry({ hash, id: hash ? entry.id + 1 : entry.id })
  return <ResetPasswordForm key={entry.id} />
}

function ResetPasswordForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const [token, setToken] = useState(() => readRecoveryToken() || recoveryTokenFromHash(location.hash))
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const pending = useRef(false)
  const cooling = useRetryCooldown(retryAt)
  const { resetPassword } = useAuth()
  // The mounted page now owns the secret; dropping the bootstrap copy prevents
  // route remounts from reviving it. StrictMode's render replay remains safe.
  useEffect(() => {
    clearRecoveryToken()
    // Also scrub client-side navigation, not just full email-link page loads.
    if (location.hash || location.search) navigate('/reset-password', { replace: true })
  }, [location.hash, location.search, navigate])

  async function submit(event) {
    event.preventDefault()
    if (pending.current || !token || cooling) return
    const validation = newPasswordError(password) || (password !== confirmation ? 'Passwords do not match.' : '')
    if (validation) { setError(validation); return }
    pending.current = true
    setBusy(true); setError('')
    try {
      await resetPassword(token, password)
      setDone(true); setToken('')
    } catch (failure) {
      setRetryAt(recoveryRetryAt(failure))
      // Only validation, CSRF, and rate limiting guarantee no token consumption.
      // Lost responses/5xx/conflicts require a fresh link, never a blind retry.
      const safeToRetry = ['VALIDATION', 'CSRF_REJECTED', 'AUTH_RATE_LIMITED'].includes(failure.code)
      if (!safeToRetry) setToken('')
      setError(safeToRetry ? failure.message : failure.code === 'PASSWORD_RESET_INVALID'
        ? 'This link is invalid, expired, or already used. Request a new link.'
        : 'This reset could not be confirmed. Try logging in with your new password, or request a new link.')
    } finally {
      setPassword(''); setConfirmation('')
      pending.current = false; setBusy(false)
    }
  }

  return <RecoveryLayout title={done ? 'Password updated' : token ? 'Reset your password' : 'Request a new reset link'}
    description={done ? 'Your previous sessions have ended. Log in with your new password.' : token ? 'Choose a new password for your account.' : 'This link is missing, invalid, or no longer available in this tab.'}>
    {done ? <div role="status" className="flex items-center gap-3 text-sm text-teal-700 dark:text-teal-300"><CheckCircle2 size={22} />Your password has been changed.</div>
      : !token ? <>
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
        <Link to="/forgot-password" className="inline-flex rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500">Request a new link</Link>
      </> : <form onSubmit={submit} aria-busy={busy}>
        <p id="password-help" className="mb-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{PASSWORD_HELP}</p>
        {[['New password', password, setPassword], ['Confirm new password', confirmation, setConfirmation]].map(([label, value, setter]) =>
          <label key={label} className="mb-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}
            <input type="password" autoComplete="new-password" required value={value} disabled={busy} aria-describedby="password-help"
              onChange={(event) => setter(event.target.value)}
              className="mt-2 w-full min-w-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-950" />
          </label>)}
        {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
        <button type="submit" disabled={busy || cooling} className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
          {busy ? 'Updating password...' : cooling ? 'Please wait before retrying' : 'Update password'}
        </button>
      </form>}
  </RecoveryLayout>
}
