import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfilePage from '../pages/ProfilePage'

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(), getGitHubAccount: vi.fn(), requestVerification: vi.fn(),
  token: 'access-token',
}))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({
  user: { name: 'Test', email: 'test@example.com' },
  sessionKey: 'same-session', token: mocks.token,
}) }))
vi.mock('../context/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../components/AppHeader', () => ({ default: () => null }))
vi.mock('../lib/api', () => ({
  authApi: { getProfile: mocks.getProfile, requestEmailVerification: mocks.requestVerification },
  integrationApi: { getGitHubAccount: mocks.getGitHubAccount },
}))

const profile = { data: { user: { name: 'Test', email: 'test@example.com', emailVerified: false }, stats: {} } }
const page = () => <MemoryRouter><ProfilePage /></MemoryRouter>

beforeEach(() => {
  vi.resetAllMocks()
  mocks.token = 'access-token'
  mocks.getProfile.mockResolvedValue(profile)
  mocks.getGitHubAccount.mockResolvedValue({ data: { account: null } })
  mocks.requestVerification.mockResolvedValue({ data: { message: 'Request accepted' } })
})
afterEach(cleanup)

it('keeps verification usable when GitHub requires verified email', async () => {
  mocks.getGitHubAccount.mockRejectedValue(Object.assign(new Error('Verify your email to access GitHub'), {
    status: 403, code: 'EMAIL_VERIFICATION_REQUIRED',
  }))
  render(page())
  const button = await screen.findByRole('button', { name: 'Send verification link' })
  expect(button.disabled).toBe(false)
  expect(screen.getByText('Verify your email to access GitHub')).toBeTruthy()
  fireEvent.click(button)
  await screen.findByRole('button', { name: 'Please wait before resending' })
  expect(mocks.requestVerification).toHaveBeenCalledExactlyOnceWith('access-token')
})

it('does not wait for GitHub before showing verification controls', async () => {
  let finish
  mocks.getGitHubAccount.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  render(page())
  expect((await screen.findByRole('button', { name: 'Send verification link' })).disabled).toBe(false)
  await act(async () => finish({ data: { account: null } }))
})

it('does not show verification controls when the profile itself fails to load', async () => {
  mocks.getProfile.mockRejectedValue(new Error('Profile unavailable'))
  render(page())
  await screen.findByText('Profile unavailable')
  expect(screen.queryByRole('button', { name: 'Send verification link' })).toBeNull()
  expect(mocks.requestVerification).not.toHaveBeenCalled()
})

it('preserves edits on renewal and ignores outdated integration failures', async () => {
  let rejectOldRequest
  mocks.getGitHubAccount.mockReturnValueOnce(new Promise((_, reject) => { rejectOldRequest = reject }))
  const view = render(page())
  await screen.findByRole('button', { name: 'Send verification link' })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved name' } })
  mocks.token = 'renewed-token'
  view.rerender(page())
  await act(async () => rejectOldRequest(new Error('Outdated GitHub failure')))
  expect(mocks.getProfile).toHaveBeenLastCalledWith('renewed-token')
  expect(mocks.getGitHubAccount).toHaveBeenLastCalledWith('renewed-token')
  expect(screen.getByLabelText('Name').value).toBe('Unsaved name')
  expect(screen.queryByText('Outdated GitHub failure')).toBeNull()
})
