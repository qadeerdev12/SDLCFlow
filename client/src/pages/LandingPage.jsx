import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import Logo from '../components/Logo'

export default function LandingPage() {
  const { dark, toggle } = useTheme()

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      {/* Nav */}
      <nav className={`flex items-center justify-between px-8 py-4 border-b ${dark ? 'border-slate-800' : 'border-gray-200'}`}>
        <Logo size="md" />
        <div className="flex items-center gap-3">
          <button onClick={toggle} className={`p-2 rounded-full ${dark ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
            {dark ? '☀️' : '🌙'}
          </button>
          <Link to="/login" className={`px-4 py-2 rounded-lg text-sm font-medium ${dark ? 'text-slate-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
            Log in
          </Link>
          <Link to="/register" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
            Sign up free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6 ${dark ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>
          Real-time collaboration for modern teams
        </div>
        <h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold max-w-3xl leading-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
          Organize your work,{' '}
          <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">together.</span>
        </h1>
        <p className={`mt-6 text-lg max-w-xl leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          A simple, real-time board for teams to manage tasks, track progress, and stay in sync — without the complexity.
        </p>
        <div className="flex gap-3 mt-10">
          <Link to="/register" className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/25 transition">
            Get started — it's free
          </Link>
          <Link to="/login" className={`px-6 py-3 rounded-lg border font-medium transition ${dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
            Log in
          </Link>
        </div>
      </section>

      {/* Board preview mockup */}
      <section className="px-8 pb-20">
        <div className={`max-w-3xl mx-auto rounded-2xl border p-6 ${dark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200 shadow-xl shadow-gray-200/50'}`}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className={`ml-3 text-sm font-medium ${dark ? 'text-slate-400' : 'text-gray-400'}`}>My Project Board</span>
          </div>
          <div className="flex gap-4 overflow-hidden">
            {[
              { title: 'To Do', cards: ['Research competitors', 'Draft wireframes', 'Set up CI/CD'] },
              { title: 'In Progress', cards: ['Build auth flow', 'Design landing page'] },
              { title: 'Done', cards: ['Project setup', 'Database schema'] },
            ].map((col) => (
              <div key={col.title} className={`flex-1 rounded-xl p-3 ${dark ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide mb-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{col.title}</h3>
                <div className="flex flex-col gap-2">
                  {col.cards.map((card) => (
                    <div key={card} className={`rounded-lg px-3 py-2 text-sm ${dark ? 'bg-slate-800 text-slate-300' : 'bg-white text-gray-700 shadow-sm border border-gray-100'}`}>
                      {card}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={`px-8 py-20 ${dark ? 'bg-slate-800/40' : 'bg-white'}`}>
        <h2 className={`text-2xl font-bold text-center mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>Everything you need, nothing you don't</h2>
        <p className={`text-center mb-12 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Built for clarity and speed.</p>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" rx="1" />
                  <rect x="14" y="3" width="7" height="5" rx="1" />
                  <rect x="14" y="12" width="7" height="9" rx="1" />
                  <rect x="3" y="16" width="7" height="5" rx="1" />
                </svg>
              ),
              title: 'Boards & Lists',
              desc: 'Create boards for each project and organize work into lists that fit your workflow.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 9 2 12 5 15" />
                  <polyline points="9 5 12 2 15 5" />
                  <polyline points="15 19 12 22 9 19" />
                  <polyline points="19 9 22 12 19 15" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                </svg>
              ),
              title: 'Drag & Drop',
              desc: 'Move cards between lists with a simple drag. Changes persist instantly.',
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10" />
                  <polyline points="12 6 12 12 16 14" />
                  <path d="M17 3v4h4" />
                </svg>
              ),
              title: 'Real-time Sync',
              desc: "See your team's updates live. No refresh needed — everyone stays in sync.",
            },
          ].map((f) => (
            <div key={f.title} className={`rounded-xl p-6 border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${dark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                {f.icon}
              </div>
              <h3 className={`font-semibold mb-2 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{f.title}</h3>
              <p className={`text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-8 py-20 text-center">
        <h2 className={`text-2xl font-bold mb-3 ${dark ? 'text-white' : 'text-gray-900'}`}>Ready to get organized?</h2>
        <p className={`mb-8 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Create your first board in seconds.</p>
        <Link to="/register" className="inline-block px-8 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-500/25 transition">
          Sign up free
        </Link>
      </section>

      {/* Footer */}
      <footer className={`border-t px-8 py-6 flex items-center justify-between ${dark ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
        <Logo size="sm" />
        <p className="text-sm">Built with React, Express & MongoDB</p>
      </footer>
    </div>
  )
}
