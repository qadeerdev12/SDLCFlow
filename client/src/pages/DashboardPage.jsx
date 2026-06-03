import { Link } from 'react-router-dom'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-indigo-400">Dashboard</h1>
        <p className="mt-2 text-slate-400">Your boards will live here (once you're logged in).</p>
        <div className="mt-4 text-sm">
          <Link to="/login" className="text-indigo-400 hover:underline">Back to Login</Link>
        </div>
      </div>
    </div>
  )
}