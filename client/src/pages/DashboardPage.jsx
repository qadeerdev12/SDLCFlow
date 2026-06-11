import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 gap-4">
      <h1 className="text-3xl font-bold text-indigo-400">Dashboard</h1>
      <p className="text-slate-400">Welcome, {user?.name}! Your boards will live here.</p>
      <button
        onClick={handleLogout}
        className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium"
      >
        Log out
      </button>
    </div>
  )
}