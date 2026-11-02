import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import VerificationRequiredNotice from '../components/VerificationRequiredNotice'

const mocks = vi.hoisted(() => ({ auth: {} }))
vi.mock('../context/useAuth', () => ({ useAuth: () => mocks.auth }))
beforeEach(() => { mocks.auth = { verificationRequired: true, retrySession: vi.fn().mockResolvedValue(), authError: '' } })
afterEach(cleanup)

it('requires an explicit status check and explains that the account stays signed in', async () => {
  render(<VerificationRequiredNotice />)
  expect(mocks.auth.retrySession).not.toHaveBeenCalled()
  expect(screen.getByText(/You are still signed in/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Check verification status' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('not confirmed yet'))
  expect(mocks.auth.retrySession).toHaveBeenCalledTimes(1)
})

it('prevents duplicate requests and disappears when the provider confirms verification', async () => {
  let finish
  mocks.auth.retrySession.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  const view = render(<VerificationRequiredNotice />)
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('button').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button'))
  expect(mocks.auth.retrySession).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  mocks.auth.verificationRequired = false
  view.rerender(<VerificationRequiredNotice />)
  expect(screen.queryByRole('region')).toBeNull()
})

it('shows a retryable failure without claiming the account is verified', async () => {
  mocks.auth.retrySession.mockRejectedValue(new Error('Network unavailable'))
  render(<VerificationRequiredNotice />)
  fireEvent.click(screen.getByRole('button'))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not check verification. Please try again.')
  expect(screen.getByRole('button').disabled).toBe(false)
})
