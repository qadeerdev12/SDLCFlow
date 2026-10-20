import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfilePage from '../pages/ProfilePage'
import CardDetailModal from '../components/CardDetailModal'

const mocks = vi.hoisted(() => ({
  auth: {}, getProfile: vi.fn(), getGitHubAccount: vi.fn(), getCardComments: vi.fn(),
}))
vi.mock('../context/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../context/useToast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('../components/AppHeader', () => ({ default: () => null }))
vi.mock('../components/TaskDraftPanel', () => ({
  default: ({ token }) => <input aria-label="AI brief" data-token={token} defaultValue="" />,
}))
vi.mock('../lib/api', () => ({
  authApi: { getProfile: mocks.getProfile },
  integrationApi: { getGitHubAccount: mocks.getGitHubAccount },
  boardApi: { getCardComments: mocks.getCardComments },
}))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth = { user: { id: 'one', name: 'Test', email: 'test@example.com' }, token: 'old', sessionKey: 'session' }
  mocks.getProfile.mockResolvedValue({ data: { user: mocks.auth.user, stats: {} } })
  mocks.getGitHubAccount.mockResolvedValue({ data: { account: null } })
  mocks.getCardComments.mockResolvedValue({ data: { comments: [] } })
})
afterEach(cleanup)

it('preserves edited profile fields after renewal but resets on a new session', async () => {
  const tree = () => <MemoryRouter><ProfilePage /></MemoryRouter>
  const view = render(tree())
  const name = await screen.findByLabelText('Name')
  fireEvent.change(name, { target: { value: 'Unfinished name' } })
  const password = screen.getByLabelText('Current password')
  fireEvent.change(password, { target: { value: 'private draft' } })
  mocks.auth.token = 'renewed'
  view.rerender(tree())
  await waitFor(() => expect(mocks.getProfile).toHaveBeenLastCalledWith('renewed'))
  expect(screen.getByLabelText('Name')).toBe(name)
  expect(name.value).toBe('Unfinished name')
  expect(password.value).toBe('private draft')
  mocks.auth.sessionKey = 'next-session'
  view.rerender(tree())
  await waitFor(() => expect(screen.getByLabelText('Name').value).toBe('Test'))
  expect(screen.getByLabelText('Current password').value).toBe('')
})

it('preserves the AI draft editor while updating its token prop', async () => {
  const props = { boardId: 'board', card: { _id: 'card', title: 'Task', list: 'list' },
    lists: [{ _id: 'list', title: 'Todo' }], sessionKey: 'session', token: 'old' }
  const view = render(<CardDetailModal {...props} />)
  const brief = await screen.findByLabelText('AI brief')
  fireEvent.change(brief, { target: { value: 'Unfinished AI instructions' } })
  view.rerender(<CardDetailModal {...props} token="renewed" />)
  expect(screen.getByLabelText('AI brief')).toBe(brief)
  expect(brief.value).toBe('Unfinished AI instructions')
  expect(brief.dataset.token).toBe('renewed')
  view.rerender(<CardDetailModal {...props} sessionKey="next-session" token="next" />)
  expect(screen.getByLabelText('AI brief').value).toBe('')
})
