import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AuthShell } from '../pages/LoginPage'
import { useTheme } from '../context/useTheme'
import Logo from './Logo'

export default function RecoveryLayout({ title, description, children }) {
  const { dark, toggle } = useTheme()
  return <AuthShell dark={dark} toggle={toggle}>
    <section className="w-full min-w-0 max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
      <Link to="/" aria-label="SDLCFlow home"><Logo size="md" /></Link>
      <h1 className="mt-8 text-2xl font-semibold text-zinc-950 dark:text-zinc-100">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p>
      <div className="mt-6">{children}</div>
      <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"><ArrowLeft size={16} />Back to log in</Link>
    </section>
  </AuthShell>
}
