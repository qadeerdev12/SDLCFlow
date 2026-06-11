import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  // Form fields — one piece of state per input (a "controlled form").
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { register } = useAuth()   // the register function from our context
  const navigate = useNavigate()   // lets us redirect after success

  async function handleSubmit(e) {
    e.preventDefault()             // stop the browser's default full-page form submit
    setError('')
    setSubmitting(true)
    try {
      await register(name, email, password)  // context → api → server → DB
      navigate('/dashboard')                 // success! go to the dashboard
    } catch (err) {
      setError(err.message)         // show the server's error message
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-8 bg-slate-800 rounded-xl">
        <h1 className="text-2xl font-bold text-indigo-400 mb-6">Create your account</h1>

        {error && (
          <p className="mb-4 text-sm text-red-400 bg-red-950/40 rounded p-2">{error}</p>
        )}

        <label className="block text-sm mb-1">Name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded bg-slate-700 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />

        <label className="block text-sm mb-1">Email</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded bg-slate-700 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 rounded bg-slate-700 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />

        <button
          type="submit" disabled={submitting}
          className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium"
        >
          {submitting ? 'Creating account...' : 'Register'}
        </button>

        <p className="mt-4 text-sm text-slate-400 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:underline">Log in</Link>
        </p>
      </form>
    </div>
  )
}