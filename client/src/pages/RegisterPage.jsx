import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Logo from '../components/Logo'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { register } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(name, email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      <button onClick={toggle} className={`fixed top-4 right-4 p-2 rounded-full ${dark ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
        {dark ? '☀️' : '🌙'}
      </button>

      <form onSubmit={handleSubmit} className={`w-full max-w-sm p-8 rounded-xl border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="flex justify-center mb-6">
          <Link to="/"><Logo size="md" /></Link>
        </div>
        <h1 className={`text-xl font-bold mb-6 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>Create your account</h1>

        {error && (
          <p className={`mb-4 text-sm rounded p-2 ${dark ? 'text-red-400 bg-red-950/40' : 'text-red-600 bg-red-50'}`}>{error}</p>
        )}

        <label className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>Name</label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          className={`w-full mb-4 px-3 py-2 rounded border outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
          required
        />

        <label className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>Email</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className={`w-full mb-4 px-3 py-2 rounded border outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
          required
        />

        <label className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>Password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className={`w-full mb-6 px-3 py-2 rounded border outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-gray-50 border-gray-300 text-gray-900'}`}
          required
        />

        <button
          type="submit" disabled={submitting}
          className="w-full py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium text-white"
        >
          {submitting ? 'Creating account...' : 'Register'}
        </button>

        <p className={`mt-4 text-sm text-center ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          Already have an account?{' '}
          <Link to="/login" className={`hover:underline ${dark ? 'text-indigo-400' : 'text-indigo-600'}`}>Log in</Link>
        </p>
      </form>
    </div>
  )
}
