import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfilePage from '../pages/ProfilePage'

const mocks = vi.hoisted(() => ({ logout: vi.fn(), updatePassword: vi.fn(), getProfile: vi.fn(), getGitHubAccount: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Test', email: 'test@example.com' }, token: 'old-token', updatePassword: mocks.updatePassword }) }))
vi.mock('../context/useToast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
vi.mock('../components/AppHeader', () => ({ default: () => null }))
vi.mock('../lib/api', () => ({ authApi: { getProfile: mocks.getProfile }, integrationApi: { getGitHubAccount: mocks.getGitHubAccount } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getProfile.mockResolvedValue({ data: { user: { name: 'Test', email: 'test@example.com' }, stats: {} } })
  mocks.getGitHubAccount.mockResolvedValue({ data: { account: null } })
})
afterEach(cleanup)

async function submit() {
  render(<MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/login" element={<h1>Login screen</h1>} />
  </Routes></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Current password'), { target: { value: 'original passphrase' } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'replacement passphrase' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'replacement passphrase' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

it('clears the current session and returns to login after a successful password change', async () => {
  mocks.updatePassword.mockResolvedValue({ data: { updated: true } })
  await submit()
  await screen.findByRole('heading', { name: 'Login screen' })
  expect(mocks.updatePassword).toHaveBeenCalledWith('original passphrase', 'replacement passphrase')
  expect(mocks.logout).not.toHaveBeenCalled()
  expect(mocks.success).toHaveBeenCalledWith('Password updated', 'Sign in again using your new password.')
})

it('keeps the user on the profile with an error when the password change fails', async () => {
  mocks.updatePassword.mockRejectedValue(new Error('Current password is incorrect.'))
  await submit()
  await screen.findByText('Current password is incorrect.')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' }).disabled).toBe(false))
  expect(mocks.logout).not.toHaveBeenCalled()
  expect(mocks.success).not.toHaveBeenCalled()
  expect(screen.queryByRole('heading', { name: 'Login screen' })).toBeNull()
})
