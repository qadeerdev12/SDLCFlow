import { useRef, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { useLatestRequest } from '../hooks/useLatestRequest'

export default function VerificationRequiredNotice() {
  const { verificationRequired, retrySession, authError } = useAuth()
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const latest = useLatestRequest()

  async function check() {
    if (pending.current) return
    pending.current = true
    const current = latest('verification-status')
    setBusy(true)
    setError('')
    try {
      // Reload /auth/me, not the token cookie. The provider clears this gate
      // only when the signed-in account is confirmed verified by the server.
      await retrySession()
      if (current()) setChecked(true)
    } catch {
      if (current()) setError('Could not check verification. Please try again.')
    } finally {
      pending.current = false
      if (current()) setBusy(false)
    }
  }

  if (!verificationRequired) return null
  return <section aria-label="Email verification required" className="mb-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
    <h2 className="font-semibold">Verify your email to continue</h2>
    <p className="mt-1">You are still signed in. Use the email verification controls below to request a link, then confirm it in your inbox.</p>
    <button type="button" disabled={busy} onClick={check} className="mt-3 inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 font-semibold disabled:opacity-50 dark:border-zinc-600">
      <MailCheck size={16} />{busy ? 'Checking verification...' : 'Check verification status'}
    </button>
    {(error || authError) ? <p role="alert" className="mt-2 text-red-600 dark:text-red-300">{error || authError}</p>
      : checked && !busy && <p role="status" className="mt-2">Verification is not confirmed yet. Open the latest email link, then check again.</p>}
  </section>
}
