import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import RecoveryLayout from '../components/RecoveryLayout'
import { useAuth } from '../context/useAuth'
import { recoveryTokenFromHash } from '../lib/recoveryLink'
import { readVerificationToken, clearVerificationToken } from '../lib/verificationLink'
import { confirmEmailVerification } from '../lib/emailVerification'
import { recoveryRetryAt } from '../lib/passwordRecovery'
import { useRetryCooldown } from '../hooks/useRetryCooldown'

export default function VerifyEmailPage() {
  const { hash } = useLocation()
  const [entry, setEntry] = useState({ hash, id: 0 })
  // Reopened mail can be hash-only navigation. Isolate incoming proofs from
  // pending results, but do not remount when we scrub our own fragment.
  if (entry.hash !== hash) setEntry({ hash, id: hash ? entry.id + 1 : entry.id })
  return <VerificationForm key={entry.id} />
}

function VerificationForm() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, retrySession } = useAuth()
  const [token, setToken] = useState(() => readVerificationToken() || recoveryTokenFromHash(location.hash))
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const pending = useRef(false)
  const cooling = useRetryCooldown(retryAt)
  useEffect(() => {
    clearVerificationToken()
    if (location.hash || location.search) navigate('/verify-email', { replace: true })
  }, [location.hash, location.search, navigate])

  async function confirm() {
    if (pending.current || !token || cooling) return
    pending.current = true
    setBusy(true); setError('')
    try {
      await confirmEmailVerification(token)
      setToken(''); setDone(true)
      // The link might belong to another account. Fetch the actual owner state
      // through the session-guarded provider, never optimistically mark it true.
      if (user) void retrySession().catch(() => {})
    } catch (failure) {
      const safe = ['VALIDATION', 'CSRF_REJECTED', 'AUTH_RATE_LIMITED'].includes(failure.code)
      if (!safe) setToken('')
      setRetryAt(recoveryRetryAt(failure))
      setError(safe ? failure.message : failure.code === 'EMAIL_VERIFICATION_INVALID'
        ? 'This link is invalid, expired, or already used. Request a new link from your profile.'
        : 'Verification could not be confirmed. Check your profile before requesting another link.')
    } finally { pending.current = false; setBusy(false) }
  }

  return <RecoveryLayout title={done ? 'Email verified' : token ? 'Verify your email' : 'Check your verification link'}
    description={done ? 'The email address associated with this link is now verified.' : token ? 'Confirm your email address to complete this account check.' : 'Reopen your email link, or sign in and request a new one from your profile.'}>
    {done && <p role="status" className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-300"><CheckCircle2 size={20} />Verification complete.</p>}
    {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
    {token && <button type="button" onClick={confirm} disabled={busy || cooling} className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
      {busy ? 'Verifying...' : cooling ? 'Please wait before retrying' : 'Verify email'}
    </button>}
    {!token && <Link to={user ? '/profile' : '/login'} className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">{user ? 'Go to profile' : 'Log in to your account'}</Link>}
  </RecoveryLayout>
}
