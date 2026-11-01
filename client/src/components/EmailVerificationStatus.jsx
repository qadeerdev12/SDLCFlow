import { useRef, useState } from 'react'
import { BadgeCheck, Mail } from 'lucide-react'
import { authApi } from '../lib/api'
import { recoveryRetryAt } from '../lib/passwordRecovery'
import { useRetryCooldown } from '../hooks/useRetryCooldown'
import { useLatestRequest } from '../hooks/useLatestRequest'

export default function EmailVerificationStatus({ account, token, disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const pending = useRef(false)
  const latest = useLatestRequest()
  const cooling = useRetryCooldown(retryAt)

  async function request() {
    if (pending.current || cooling || disabled || account.emailVerified) return
    pending.current = true
    const current = latest('verification')
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await authApi.requestEmailVerification(token)
      if (!current()) return
      if (typeof result?.data?.message !== 'string') throw new Error('Unexpected response')
      setMessage('If your email needs verification, a link may be sent. Check your inbox and spam folder.')
      // Mirrors server admission cooldown, not a delivery guarantee. The server
      // remains authoritative across remounts, email edits and other tabs.
      setRetryAt(Date.now() + 15 * 60 * 1000)
    } catch (failure) {
      if (!current()) return
      setRetryAt(recoveryRetryAt(failure))
      setError(failure.code === 'EMAIL_VERIFICATION_UNAVAILABLE' || failure.status === 429
        ? failure.message : 'We could not confirm your request. Check your inbox before trying again.')
    } finally {
      pending.current = false
      if (current()) setBusy(false)
    }
  }

  return <div className="mt-4 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
    <p className={`flex items-center gap-2 font-medium ${account.emailVerified ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-600 dark:text-zinc-300'}`}>
      {account.emailVerified ? <BadgeCheck size={18} /> : <Mail size={18} />}
      {account.emailVerified ? 'Email verified' : 'Email not verified'}
    </p>
    {!account.emailVerified && <>
      <p className="mt-2 break-all text-xs text-zinc-500 dark:text-zinc-400">Verification address: {account.email}</p>
      <button type="button" disabled={disabled || busy || cooling} onClick={request} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
        <Mail size={16} />{busy ? 'Requesting link...' : cooling ? 'Please wait before resending' : 'Send verification link'}
      </button>
      {cooling && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Resending is temporarily paused. Use the latest email link.</p>}
      {message && <p role="status" className="mt-3 text-teal-700 dark:text-teal-300">{message}</p>}
      {error && <p role="alert" className="mt-3 text-red-600 dark:text-red-300">{error}</p>}
    </>}
  </div>
}
