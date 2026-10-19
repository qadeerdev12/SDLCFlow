import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfilePage from '../pages/ProfilePage'

const mocks = vi.hoisted(() => ({ logout: vi.fn(), logoutEverywhere: vi.fn(), getProfile: vi.fn(), getGitHubAccount: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { name: 'Test', email: 'test@example.com' }, token: 'old-token', logout: mocks.logout }) }))
vi.mock('../context/useToast', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))
vi.mock('../components/AppHeader', () => ({ default: () => null }))
vi.mock('../lib/api', () => ({ authApi: { getProfile: mocks.getProfile, logoutEverywhere: mocks.logoutEverywhere }, integrationApi: { getGitHubAccount: mocks.getGitHubAccount } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getProfile.mockResolvedValue({ data: { user: { name: 'Test', email: 'test@example.com' }, stats: {} } })
  mocks.getGitHubAccount.mockResolvedValue({ data: { account: null } })
})
afterEach(cleanup)

async function openConfirmation() {
  render(<MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/login" element={<h1>Login screen</h1>} />
  </Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Log out everywhere' }))
  return screen.getByRole('alertdialog')
}

it('requires confirmation and allows cancellation without contacting the server', async () => {
  const dialog = await openConfirmation()
  expect(within(dialog).getByText(/including this browser/)).toBeTruthy()
  expect(mocks.logoutEverywhere).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mocks.logout).not.toHaveBeenCalled()
  expect(mocks.logoutEverywhere).not.toHaveBeenCalled()
})

it('prevents duplicate submissions and clears the original session after success', async () => {
  let finish
  mocks.logoutEverywhere.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  const dialog = await openConfirmation()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))
  const pending = within(dialog).getByRole('button', { name: 'Working...' })
  expect(pending.disabled).toBe(true)
  expect(within(dialog).getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  fireEvent.click(pending)
  expect(mocks.logoutEverywhere).toHaveBeenCalledExactlyOnceWith('old-token')
  expect(mocks.logout).not.toHaveBeenCalled()
  await act(async () => finish({ data: { loggedOut: true } }))
  await screen.findByRole('heading', { name: 'Login screen' })
  expect(mocks.logout).toHaveBeenCalledExactlyOnceWith('old-token')
  expect(mocks.success).toHaveBeenCalledWith('Logged out everywhere', 'Sign in again to continue.')
})

it('keeps the profile usable after a failed request and allows retry', async () => {
  mocks.logoutEverywhere.mockRejectedValueOnce(new Error('Service unavailable'))
  const dialog = await openConfirmation()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Log out everywhere' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('Service unavailable')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(mocks.logout).not.toHaveBeenCalled()
  mocks.logoutEverywhere.mockResolvedValueOnce({ data: { loggedOut: true } })
  fireEvent.click(screen.getByRole('button', { name: 'Log out everywhere' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Log out everywhere' }))
  await screen.findByRole('heading', { name: 'Login screen' })
  expect(mocks.logoutEverywhere).toHaveBeenCalledTimes(2)
})
