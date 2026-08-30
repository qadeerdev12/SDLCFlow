import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import Logo from '../components/Logo'

const previewColumns = [
  {
    title: 'Backlog',
    count: 8,
    cards: [
      { title: 'Map project milestones', tag: 'Planning', status: 'Ready', tone: 'teal' },
      { title: 'Collect customer notes', tag: 'Research', status: 'Draft', tone: 'amber' },
      { title: 'Scope mobile board view', tag: 'Design', status: 'Next', tone: 'cyan' },
    ],
  },
  {
    title: 'In Progress',
    count: 3,
    cards: [
      { title: 'Realtime drag persistence', tag: 'Core', status: 'Today', tone: 'teal' },
      { title: 'Dashboard filters', tag: 'UI', status: 'Review', tone: 'rose' },
    ],
  },
  {
    title: 'Done',
    count: 12,
    cards: [
      { title: 'Auth and board access', tag: 'API', status: 'Shipped', tone: 'cyan' },
      { title: 'List ordering system', tag: 'Core', status: 'Shipped', tone: 'teal' },
    ],
  },
]

const features = [
  {
    title: 'Realtime project boards',
    text: 'Move work from idea to shipped while everyone sees the same board state.',
    icon: 'layout',
  },
  {
    title: 'Jira-style flow, less noise',
    text: 'Use Backlog, Next, In Progress, Review, and Done without a heavy process layer.',
    icon: 'flow',
  },
  {
    title: 'Personal project cockpit',
    text: 'Keep your solo builds, experiments, and client work separated by board.',
    icon: 'target',
  },
  {
    title: 'Fast drag planning',
    text: 'Reorder lists and cards directly on the board when priorities shift.',
    icon: 'move',
  },
  {
    title: 'Team-ready spaces',
    text: 'Invite collaborators later without changing how your projects are organised.',
    icon: 'users',
  },
  {
    title: 'Dark mode workspace',
    text: 'Switch between a bright planning desk and a quiet night-build view.',
    icon: 'moon',
  },
]

const workflow = ['Capture', 'Prioritise', 'Build', 'Review', 'Ship']

const activity = [
  { person: 'QA', action: 'moved Realtime drag persistence to Review', time: '2m ago' },
  { person: 'MK', action: 'added API error states to Backlog', time: '9m ago' },
  { person: 'AR', action: 'completed List ordering system', time: '18m ago' },
]

export default function LandingPage() {
  const { dark, toggle } = useTheme()

  return (
    <div className="min-h-screen overflow-hidden bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <nav className="sticky top-0 z-40 border-b border-zinc-200 bg-stone-50/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <Logo size="md" />
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-300 md:flex">
            <a href="#features" className="hover:text-zinc-950 dark:hover:text-white">Features</a>
            <a href="#workflow" className="hover:text-zinc-950 dark:hover:text-white">Workflow</a>
            <a href="#collaboration" className="hover:text-zinc-950 dark:hover:text-white">Collaboration</a>
          </div>
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
        <section className="relative mx-auto grid min-h-[calc(100vh-66px)] max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="landing-grid" />

          <div className="relative z-10 max-w-xl">
            <p className="landing-rise mb-4 inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
              Project command center
            </p>
            <h1 className="landing-rise landing-delay-1 text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl dark:text-white">
              Bring your projects into one live board.
            </h1>
            <p className="landing-rise landing-delay-2 mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              CollabBoard gives you a focused Jira-style workspace for planning, prioritising, and shipping the projects you are building now.
            </p>
            <div className="landing-rise landing-delay-3 mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="landing-button rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500">
                Create workspace
              </Link>
              <Link to="/login" className="rounded-lg border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
                Open dashboard
              </Link>
            </div>
            <div className="landing-rise landing-delay-4 mt-10 grid grid-cols-3 gap-5 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <Stat value="Live" label="updates" />
              <Stat value="Kanban" label="workflow" />
              <Stat value="Solo+" label="team ready" />
            </div>
          </div>

          <HeroBoard />
        </section>

        <section id="features" className="relative border-y border-zinc-200 bg-white py-20 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Key features</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">Built for the way projects actually move.</h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {features.map((feature, index) => (
                <FeatureCard key={feature.title} feature={feature} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="workflow" className="py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">Workflow</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">A simple path from idea to done.</h2>
                <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Shape each board around a practical delivery loop. Keep the columns obvious, keep the cards moving, and avoid burying your project in ceremony.
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
                <div className="grid gap-3 sm:grid-cols-5">
                  {workflow.map((step, index) => (
                    <div key={step} className="landing-step rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950" style={{ animationDelay: `${index * 120}ms` }}>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-xs font-bold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                        {index + 1}
                      </span>
                      <p className="mt-4 text-sm font-semibold text-zinc-950 dark:text-zinc-100">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="collaboration" className="border-t border-zinc-200 bg-zinc-950 py-20 text-white dark:border-zinc-800">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Realtime collaboration</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">See momentum as it happens.</h2>
              <p className="mt-4 text-sm leading-6 text-zinc-300">
                CollabBoard is designed around shared state: cards move, boards update, and collaborators stay oriented without refreshing or asking what changed.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <StatDark value="3" label="active members" />
                <StatDark value="24" label="open tasks" />
                <StatDark value="5" label="workflow lists" />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Live activity</p>
                <span className="landing-pulse rounded-full bg-teal-400 px-2 py-1 text-xs font-bold text-zinc-950">Online</span>
              </div>
              <div className="space-y-3">
                {activity.map((item, index) => (
                  <div key={item.action} className="landing-activity flex items-start gap-3 rounded-lg border border-white/10 bg-zinc-950/60 p-3" style={{ animationDelay: `${index * 180}ms` }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-500 text-xs font-bold text-zinc-950">{item.person}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-100">{item.action}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-16 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Ready</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Start with one project board.</h2>
            </div>
            <Link to="/register" className="landing-button rounded-lg bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500">
              Create workspace
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}

function HeroBoard() {
  return (
    <div className="landing-board relative z-10 min-w-0 rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-300/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
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
        {previewColumns.map((column, columnIndex) => (
          <div key={column.title} className="min-h-[380px] rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-300">{column.title}</h2>
              <span className="rounded-md bg-white px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                {column.count}
              </span>
            </div>
            <div className="space-y-2">
              {column.cards.map((card, cardIndex) => (
                <div
                  key={card.title}
                  className="landing-card rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  style={{ animationDelay: `${columnIndex * 140 + cardIndex * 110}ms` }}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className={tagClass(card.tone)}>{card.tag}</span>
                    <span className="text-[11px] text-zinc-400">{card.status}</span>
                  </div>
                  <p className="text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">{card.title}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="landing-cursor absolute right-[34%] top-[42%] hidden rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-950 md:block">
        Qadeer editing
      </div>
    </div>
  )
}

function FeatureCard({ feature, index }) {
  return (
    <div className="landing-feature rounded-xl border border-zinc-200 bg-stone-50 p-5 shadow-sm transition hover:-translate-y-1 hover:border-teal-200 hover:bg-white hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-teal-500/30 dark:hover:bg-zinc-900" style={{ animationDelay: `${index * 90}ms` }}>
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
        <FeatureIcon type={feature.icon} />
      </span>
      <h3 className="mt-5 text-base font-semibold text-zinc-950 dark:text-zinc-100">{feature.title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{feature.text}</p>
    </div>
  )
}

function FeatureIcon({ type }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const icons = {
    layout: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    flow: <><path d="M5 6h9a4 4 0 0 1 0 8H8" /><path d="m8 10-4 4 4 4" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    move: <><path d="M12 2v20" /><path d="M2 12h20" /><path d="m5 9-3 3 3 3" /><path d="m19 9 3 3-3 3" /><path d="m9 5 3-3 3 3" /><path d="m9 19 3 3 3-3" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
  }

  return <svg {...common}>{icons[type]}</svg>
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-sm font-bold text-zinc-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function StatDark({ value, label }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{label}</p>
    </div>
  )
}

function tagClass(tone) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  }

  return `rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`
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
