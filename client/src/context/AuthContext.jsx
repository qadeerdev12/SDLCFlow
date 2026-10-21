import { MemoryAuthProvider } from './MemoryAuthProvider'

// Keep one authentication policy. Unknown or retired modes fail rather than
// quietly restoring browser-stored bearer credentials.
export function AuthProvider({ children, mode = 'memory' }) {
  if (mode !== 'memory') throw new Error('Only memory authentication is supported')
  return <MemoryAuthProvider>{children}</MemoryAuthProvider>
}
