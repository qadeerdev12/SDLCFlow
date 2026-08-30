import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import Logo from '../components/Logo'

const previewColumns = [
  {
    title: 'Backlog',
    count: 8,
    cards: [
      { title: 'Define invoice import flow', tag: 'Spec', status: 'Ready' },
      { title: 'Plan mobile board polish', tag: 'Design', status: 'Draft' },
    ],
  },
  {
    title: 'In Progress',
    count: 3,
    cards: [
      { title: 'Realtime drag persistence', tag: 'Core', status: 'Today' },
      { title: 'Project dashboard filters', tag: 'UI', status: 'Review' },
    ],
  },
  {
    title: 'Done',
    count: 12,
    cards: [
      { title: 'Auth and board access model', tag: 'API', status: 'Shipped' },
      { title: 'List ordering algorithm', tag: 'Core', status: 'Shipped' },
    ],
  },
]

export default function LandingPage() {
  const { dark, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <nav className="border-b border-zinc-200 bg-stone-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <Logo size="md" />
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-white dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <ThemeIcon dark={dark} />
            </button>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white">
              Log in
            </Link>
            <Link to="/register" className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">
              Start
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="mx-auto grid min-h-[calc(100vh-66px)] max-w-7xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-xl">
            <p className="mb-4 inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
              Project command center
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl dark:text-white">
              CollabBoard
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              A real-time board for planning, prioritising, and shipping your own projects with the clarity of a focused Jira-style workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500">
                Create workspace
              </Link>
              <Link to="/login" className="rounded-lg border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Open dashboard
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-5 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Stat value="Live" label="updates" />
              <Stat value="Boards" label="per project" />
              <Stat value="Drag" label="to plan" />
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-300/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">Product rebuild</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Sprint board · 18 open tasks</p>
              </div>
              <div className="flex -space-x-2">
                {['QA', 'MK', 'AR'].map((person) => (
                  <span key={person} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-zinc-900 text-[11px] font-semibold text-white dark:border-zinc-900">
                    {person}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-3">
              {previewColumns.map((column) => (
                <div key={column.title} className="min-h-[360px] rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-300">{column.title}</h2>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                      {column.count}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {column.cards.map((card) => (
                      <div key={card.title} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                            {card.tag}
                          </span>
                          <span className="text-[11px] text-zinc-400">{card.status}</span>
                        </div>
                        <p className="text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">{card.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-sm font-bold text-zinc-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function ThemeIcon({ dark }) {
  return dark ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}
