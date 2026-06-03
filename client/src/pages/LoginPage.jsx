import {Link} from 'react-router-dom';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-indigo-400">Login</h1>
        <p className="mt-2 text-slate-400">The login form will live here.</p>
        <div className="mt-4 flex gap-4 justify-center text-sm">
          <Link to="/register" className="text-indigo-400 hover:underline">Register</Link>
          <Link to="/dashboard" className="text-indigo-400 hover:underline">Dashboard</Link>
        </div>
      </div>
    </div>
  )
}