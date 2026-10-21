import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext'

// Behavioral session tests live in memoryAuth.test.jsx. This boundary test
// prevents the application default or a retired mode from selecting storage auth.
vi.mock('../context/MemoryAuthProvider', () => ({ MemoryAuthProvider: ({ children }) => <section aria-label="Memory authentication">{children}</section> }))
afterEach(cleanup)

it('selects memory authentication by default', () => {
  render(<AuthProvider>Application</AuthProvider>)
  expect(screen.getByRole('region', { name: 'Memory authentication' }).textContent).toBe('Application')
})

it.each(['legacy', 'unknown'])('rejects retired or unknown mode %s', (mode) => {
  expect(() => render(<AuthProvider mode={mode}>Application</AuthProvider>)).toThrow('Only memory authentication')
})
