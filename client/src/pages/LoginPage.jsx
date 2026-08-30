import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Logo from '../components/Logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { login } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell dark={dark} toggle={toggle}>
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
        <Link to="/" className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
          <Logo size="md" />
        </Link>
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Welcome back</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Log in to CollabBoard</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Return to your project boards and keep the work moving.</p>
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</p>
        )}

        <div className="mt-6 space-y-4">
          <Field label="Email" type="email" value={email} onChange={setEmail} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500 disabled:opacity-50"
        >
          {submitting ? 'Logging in...' : 'Log in'}
        </button>

        <p className="mt-5 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Need an account?{' '}
          <Link to="/register" className="font-semibold text-teal-700 hover:underline dark:text-teal-300">Register</Link>
        </p>
      </form>
    </AuthShell>
  )
}

function AuthShell({ children, dark, toggle }) {
  return (
    <div className="grid min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 lg:grid-cols-[1fr_0.85fr]">
      <button
        onClick={toggle}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="fixed right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </button>
      <div className="flex items-center justify-center px-5 py-12">{children}</div>
      <aside className="hidden border-l border-zinc-200 bg-zinc-950 p-10 text-white dark:border-zinc-800 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Project OS</p>
          <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight">One place for the work you are actively building.</h2>
        </div>
        <div className="grid gap-3">
          {['Plan sprint lists', 'Drag tasks live', 'Return to recent boards'].map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-zinc-200">
              {item}
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, type, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        required
      />
    </label>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}
