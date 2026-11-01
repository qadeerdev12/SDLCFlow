import { useRef, useState } from 'react'
import { Mail } from 'lucide-react'
import RecoveryLayout from '../components/RecoveryLayout'
import { requestPasswordReset, recoveryRetryAt } from '../lib/passwordRecovery'
import { useRetryCooldown } from '../hooks/useRetryCooldown'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const pending = useRef(false)
  const cooling = useRetryCooldown(retryAt)

  async function submit(event) {
    event.preventDefault()
    if (pending.current || cooling) return
    pending.current = true
    setBusy(true); setError('')
    try {
      await requestPasswordReset(email.trim().toLowerCase())
      setSent(true); setEmail('')
    } catch (failure) {
      setError(failure.message)
      setRetryAt(recoveryRetryAt(failure))
    } finally { pending.current = false; setBusy(false) }
  }

  return <RecoveryLayout title={sent ? 'Check your email' : 'Forgot your password?'}
    description={sent ? 'Your request has been received.' : 'Enter the email address you use for SDLCFlow.'}>
    {sent ? <div role="status" className="flex gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      <Mail size={22} className="mt-1 shrink-0 text-teal-600" />
      <p>If an account exists for that email, a reset link may be sent. Check your inbox and spam folder. Links expire after 15 minutes.</p>
    </div> : <form onSubmit={submit} aria-busy={busy}>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email
        <input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full min-w-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-950" />
      </label>
      {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <button disabled={busy || cooling} type="submit" className="mt-5 w-full rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
        {busy ? 'Requesting link...' : cooling ? 'Please wait before retrying' : 'Send reset link'}
      </button>
    </form>}
  </RecoveryLayout>
}
