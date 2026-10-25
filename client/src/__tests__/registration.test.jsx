// Tests signup policy loading with mocked policy and registration operations.
// The form stays unavailable until open registration is confirmed, and a policy
// change after page load must show feedback rather than falsely navigate.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RegisterPage from '../pages/RegisterPage'

const mocks = vi.hoisted(() => ({ policy: vi.fn(), register: vi.fn() }))
vi.mock('../lib/api', () => ({ authApi: { getRegistrationPolicy: mocks.policy } }))
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ register: mocks.register }) }))
vi.mock('../context/useTheme', () => ({ useTheme: () => ({ dark: false, toggle: vi.fn() }) }))
beforeEach(() => { vi.resetAllMocks() })
afterEach(cleanup)
function show() {
  return render(<MemoryRouter initialEntries={['/register']}><Routes>
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/dashboard" element={<h1>Projects</h1>} />
    <Route path="/login" element={<h1>Log in</h1>} />
  </Routes></MemoryRouter>)
}
async function submit() {
  await screen.findByLabelText('Name')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tester' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'tester@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

it('shows a private preview with login access and no signup form', async () => {
  mocks.policy.mockResolvedValue({ data: { mode: 'restricted' } })
  show()
  await screen.findByRole('heading', { name: 'Private preview' })
  expect(screen.queryByLabelText('Password')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Log in' }))
  await screen.findByRole('heading', { name: 'Log in' })
  expect(mocks.register).not.toHaveBeenCalled()
})

it('does not show the form until policy is known', () => {
  mocks.policy.mockReturnValue(new Promise(() => {}))
  show()
  expect(screen.getByRole('status').textContent).toContain('Checking')
  expect(screen.queryByLabelText('Email')).toBeNull()
})

it.each(['network', 'invalid'])('fails closed on %s policy errors and supports retry', async (failure) => {
  if (failure === 'network') mocks.policy.mockRejectedValueOnce(new Error('Offline'))
  else mocks.policy.mockResolvedValueOnce({ data: { mode: 'unknown' } })
  mocks.policy.mockResolvedValueOnce({ data: { mode: 'open' } })
  show()
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Email')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByLabelText('Email')
  expect(mocks.policy).toHaveBeenCalledTimes(2)
})

it('preserves normal registration in open mode', async () => {
  mocks.policy.mockResolvedValue({ data: { mode: 'open' } })
  mocks.register.mockResolvedValue({})
  show()
  await submit()
  await screen.findByRole('heading', { name: 'Projects' })
  expect(mocks.register).toHaveBeenCalledWith('Tester', 'tester@example.com', 'test-password-123')
})

it('handles policy closing after a tab loaded without navigating', async () => {
  mocks.policy.mockResolvedValue({ data: { mode: 'open' } })
  mocks.register.mockRejectedValue(Object.assign(new Error('Public signup is closed.'), { code: 'REGISTRATION_RESTRICTED' }))
  show()
  await submit()
  await screen.findByRole('heading', { name: 'Private preview' })
  expect(screen.getByRole('alert').textContent).toBe('Public signup is closed.')
  await waitFor(() => expect(screen.queryByLabelText('Email')).toBeNull())
})
