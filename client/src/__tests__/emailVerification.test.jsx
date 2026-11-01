// No real email: exercise explicit user intent, secret lifetime and retry rules.
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import VerifyEmailPage from '../pages/VerifyEmailPage'
import EmailVerificationStatus from '../components/EmailVerificationStatus'
import { captureVerificationLink, clearVerificationToken, readVerificationToken } from '../lib/verificationLink'
import { captureRecoveryLink, readRecoveryToken } from '../lib/recoveryLink'

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), request: vi.fn(), refresh: vi.fn(), user: null }))
vi.mock('../lib/emailVerification', () => ({ confirmEmailVerification: mocks.confirm }))
vi.mock('../lib/api', () => ({ authApi: { requestEmailVerification: mocks.request } }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: mocks.user, retrySession: mocks.refresh }) }))
vi.mock('../context/useTheme', () => ({ useTheme: () => ({ dark: false, toggle() {} }) }))
const token = 'a'.repeat(64)
beforeEach(() => { vi.resetAllMocks(); mocks.user = null; mocks.refresh.mockResolvedValue(); clearVerificationToken() })
afterEach(() => { cleanup(); clearVerificationToken(); window.history.replaceState(null, '', '/'); vi.useRealTimers(); vi.restoreAllMocks() })
function show(hash = `#token=${token}`) {
  window.history.replaceState(null, '', `/verify-email${hash}`)
  captureVerificationLink()
  return render(<StrictMode><MemoryRouter><VerifyEmailPage /><Link to={`/verify-email#token=${token}`}>Reopen mail</Link></MemoryRouter></StrictMode>)
}
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
function status(props = {}) {
  return render(<StrictMode><EmailVerificationStatus account={{ email: 'owner@example.com', emailVerified: false }} token="access-token" {...props} /></StrictMode>)
}

it('scrubs proof before routing, survives StrictMode, and never confirms automatically', () => {
  show()
  expect(window.location.hash).toBe('')
  expect(readVerificationToken()).toBe('')
  expect(screen.getByRole('button', { name: 'Verify email' })).toBeTruthy()
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(JSON.stringify([localStorage, sessionStorage])).not.toContain(token)
})

it.each(['', '#token=bad', `#token=${token}&token=${token}`, `?token=${token}`])('rejects missing, malformed, duplicate or query-only proof: %s', (hash) => {
  show(hash)
  expect(screen.queryByRole('button', { name: 'Verify email' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Log in to your account' })).toBeTruthy()
})

it('keeps reset and verification bootstrap tokens purpose-isolated', () => {
  window.history.replaceState(null, '', `/reset-password#token=${token}`)
  captureVerificationLink()
  expect(readVerificationToken()).toBe('')
  window.history.replaceState(null, '', `/verify-email#token=${token}`)
  captureRecoveryLink()
  expect(readRecoveryToken()).toBe('')
  captureVerificationLink()
  expect(readVerificationToken()).toBe(token)
})

it('fails closed if history cannot strip the secret', () => {
  captureVerificationLink({ pathname: '/verify-email', hash: `#token=${token}` }, { replaceState() { throw new Error('blocked') } })
  expect(readVerificationToken()).toBe('')
})

it('confirms once on explicit click and does not log a guest in', async () => {
  let finish
  mocks.confirm.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  show(); confirm()
  fireEvent.click(screen.getByRole('button', { name: 'Verifying...' }))
  expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(token)
  await act(async () => finish())
  expect(screen.getByRole('status').textContent).toContain('complete')
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Verify email' })).toBeNull()
})

it('refreshes signed-in owner state rather than assuming the proof belongs to them', async () => {
  mocks.user = { id: 'different-owner', emailVerified: false }
  mocks.confirm.mockResolvedValue()
  show(); confirm()
  await screen.findByRole('status')
  expect(mocks.refresh).toHaveBeenCalledOnce()
  expect(mocks.user.emailVerified).toBe(false)
  expect(screen.getByRole('link', { name: 'Go to profile' })).toBeTruthy()
})

it.each(['EMAIL_VERIFICATION_INVALID', undefined])('discards consumed or uncertain proof without a blind retry (%s)', async (code) => {
  mocks.confirm.mockRejectedValue(Object.assign(new Error('failure'), { code }))
  show(); confirm()
  await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: 'Verify email' })).toBeNull()
  expect(mocks.confirm).toHaveBeenCalledOnce()
})

it('retains proof on rate rejection and never schedules a network retry', async () => {
  vi.useFakeTimers()
  mocks.confirm.mockRejectedValue(Object.assign(new Error('Wait'), { code: 'AUTH_RATE_LIMITED', status: 429, retryAfter: 1 }))
  show()
  await act(async () => confirm())
  expect(screen.getByRole('button', { name: 'Please wait before retrying' }).disabled).toBe(true)
  await act(async () => vi.advanceTimersByTime(1001))
  expect(screen.getByRole('button', { name: 'Verify email' }).disabled).toBe(false)
  expect(mocks.confirm).toHaveBeenCalledOnce()
})

it('supports same-tab reopening but cannot resurrect proof after remount', async () => {
  mocks.confirm.mockResolvedValue()
  const view = show(); confirm()
  await screen.findByRole('status')
  fireEvent.click(screen.getByRole('link', { name: 'Reopen mail' }))
  expect(screen.getByRole('button', { name: 'Verify email' })).toBeTruthy()
  expect(mocks.confirm).toHaveBeenCalledOnce()
  view.unmount()
  render(<MemoryRouter><VerifyEmailPage /></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Verify email' })).toBeNull()
})

// Resend is owner-only UI. Its acknowledgement is not a delivery receipt.
it('does not send on mount, sends only bearer identity and enforces a local cooldown', async () => {
  mocks.request.mockResolvedValue({ data: { message: 'ack' } })
  status()
  expect(mocks.request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Send verification link' }))
  expect((await screen.findByRole('status')).textContent).toContain('may be sent')
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('access-token')
  expect(screen.getByRole('button', { name: 'Please wait before resending' }).disabled).toBe(true)
})

it('shows verified status without offering another send', () => {
  status({ account: { emailVerified: true } })
  expect(screen.getByText('Email verified')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})

it('disables sending while account edits are unsaved', () => {
  status({ disabled: true })
  expect(screen.getByRole('button').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button'))
  expect(mocks.request).not.toHaveBeenCalled()
})

it('reports disabled delivery without claiming mail was sent', async () => {
  mocks.request.mockRejectedValue(Object.assign(new Error('Email verification is not available yet.'), { code: 'EMAIL_VERIFICATION_UNAVAILABLE' }))
  status(); fireEvent.click(screen.getByRole('button'))
  expect((await screen.findByRole('alert')).textContent).toContain('not available')
  expect(screen.queryByRole('status')).toBeNull()
})
