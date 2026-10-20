import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AppHeader from '../components/AppHeader'

const mocks = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({
  user: { name: 'Test User', email: 'test@example.com' }, logout: mocks.logout,
}) }))
vi.mock('../context/useTheme', () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }))
vi.mock('../components/NotificationBell', () => ({ default: () => null }))
beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

function openMenu() {
  render(<MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={<AppHeader />} />
    <Route path="/login" element={<h1>Login screen</h1>} />
  </Routes></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /Test User/ }))
}

it('waits for server logout confirmation and prevents double submission', async () => {
  let finish
  mocks.logout.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
  const pending = screen.getByRole('menuitem', { name: 'Logging out...' })
  expect(pending.disabled).toBe(true)
  fireEvent.click(pending)
  expect(mocks.logout).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('heading', { name: 'Login screen' })).toBeNull()
  await act(async () => finish())
  expect(screen.getByRole('heading', { name: 'Login screen' })).toBeTruthy()
})

it('keeps the user on the page and shows an error if logout is unconfirmed', async () => {
  mocks.logout.mockRejectedValueOnce(new Error('Session response was lost. Please sign in again.'))
  openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Session response was lost')
  expect(screen.queryByRole('heading', { name: 'Login screen' })).toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Log out' }).disabled).toBe(false)
})
