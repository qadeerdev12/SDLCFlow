// UI tests use fake requests only. Tokens must survive StrictMode rendering but
// never survive URL scrubbing in storage or trigger a reset just by opening mail.
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import { captureRecoveryLink, clearRecoveryToken, readRecoveryToken } from '../lib/recoveryLink'

const mocks = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn() }))
vi.mock('../lib/passwordRecovery', async (original) => ({ ...await original(), requestPasswordReset: mocks.request }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ resetPassword: mocks.reset }) }))
vi.mock('../context/useTheme', () => ({ useTheme: () => ({ dark: false, toggle() {} }) }))
const token = 'a'.repeat(64)
beforeEach(() => { vi.resetAllMocks(); clearRecoveryToken() })
afterEach(() => { cleanup(); clearRecoveryToken(); window.history.replaceState(null, '', '/'); vi.restoreAllMocks() })
const show = (page) => render(<StrictMode><MemoryRouter>{page}</MemoryRouter></StrictMode>)
function showReset(hash = `#token=${token}`) {
  window.history.replaceState(null, '', `/reset-password${hash}`)
  captureRecoveryLink()
  return show(<ResetPasswordPage />)
}
function fill(password = 'replacement passphrase', confirm = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

it('shows an account-neutral acknowledgement after requesting and never claims delivery', async () => {
  mocks.request.mockResolvedValue(undefined)
  show(<ForgotPasswordPage />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'USER@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  await screen.findByRole('status')
  expect(screen.getByRole('status').textContent).toContain('If an account exists')
  expect(mocks.request).toHaveBeenCalledWith('user@example.com')
  expect(screen.queryByLabelText('Email')).toBeNull()
})

it('shows disabled-delivery errors without a false success screen', async () => {
  mocks.request.mockRejectedValue(new Error('Password recovery is not available yet.'))
  show(<ForgotPasswordPage />)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect((await screen.findByRole('alert')).textContent).toContain('not available')
  expect(screen.queryByRole('status')).toBeNull()
})

it('scrubs the initial link and clears the bootstrap copy without losing StrictMode page state', () => {
  showReset()
  expect(window.location.hash).toBe('')
  expect(readRecoveryToken()).toBe('')
  expect(screen.getByLabelText('New password')).toBeTruthy()
  expect(mocks.reset).not.toHaveBeenCalled()
  expect(JSON.stringify([localStorage, sessionStorage])).not.toContain(token)
})

it.each(['', '#token=bad', `#token=${token}&token=${token}`])('offers a new link without a form for invalid input %s', (hash) => {
  showReset(hash)
  expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy()
  expect(screen.queryByLabelText('New password')).toBeNull()
})

it('does not recover tokens from query parameters or after remount', () => {
  window.history.replaceState(null, '', `/reset-password?token=${token}`)
  captureRecoveryLink()
  expect(readRecoveryToken()).toBe('')
  expect(window.location.search).toBe('')
  const view = showReset()
  view.unmount()
  show(<ResetPasswordPage />)
  expect(screen.queryByLabelText('New password')).toBeNull()
})

it.each([['short', 'short'], ['replacement passphrase', 'different passphrase'], ['x'.repeat(73), 'x'.repeat(73)]])(
  'validates password policy and confirmation locally', (password, confirmation) => {
    showReset(); fill(password, confirmation)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(mocks.reset).not.toHaveBeenCalled()
  },
)

it('submits once, confirms success and removes secrets instead of logging in', async () => {
  let finish
  mocks.reset.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  showReset(); fill()
  fireEvent.click(screen.getByRole('button', { name: 'Updating password...' }))
  expect(mocks.reset).toHaveBeenCalledTimes(1)
  expect(mocks.reset).toHaveBeenCalledWith(token, 'replacement passphrase')
  finish({ updated: true })
  await screen.findByRole('status')
  expect(screen.queryByLabelText('New password')).toBeNull()
  expect(screen.getByRole('link', { name: 'Back to log in' }).getAttribute('href')).toBe('/login')
})

it.each(['PASSWORD_RESET_INVALID', 'PASSWORD_RESET_CONFLICT', 'AUTH_RECOVERY_REQUIRED', 'INTERNAL_SERVER_ERROR'])(
  'discards the secret after %s instead of replaying a potentially consumed token', async (code) => {
    mocks.reset.mockRejectedValue(Object.assign(new Error('Failure'), { code }))
    showReset(); fill()
    await screen.findByRole('alert')
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeTruthy()
    expect(mocks.reset).toHaveBeenCalledTimes(1)
  },
)

it('accepts a reopened fragment link in the same tab after a completed reset', async () => {
  mocks.reset.mockResolvedValue({ updated: true })
  render(<MemoryRouter initialEntries={[`/reset-password#token=${token}`]}>
    <ResetPasswordPage /><Link to={`/reset-password#token=${token}`}>Open another link</Link>
  </MemoryRouter>)
  fill()
  await screen.findByRole('status')
  fireEvent.click(screen.getByRole('link', { name: 'Open another link' }))
  await screen.findByLabelText('New password')
  expect(screen.queryByRole('status')).toBeNull()
  expect(mocks.reset).toHaveBeenCalledTimes(1)
})

it('preserves the token on rate limiting, clears passwords, and never automatically retries', async () => {
  mocks.reset.mockRejectedValue(Object.assign(new Error('Too many attempts'), { code: 'AUTH_RATE_LIMITED', status: 429, retryAfter: 60 }))
  showReset(); fill()
  await screen.findByRole('alert')
  await waitFor(() => expect(screen.getByLabelText('New password').value).toBe(''))
  expect(screen.getByRole('button', { name: 'Please wait before retrying' }).disabled).toBe(true)
  expect(mocks.reset).toHaveBeenCalledTimes(1)
})
