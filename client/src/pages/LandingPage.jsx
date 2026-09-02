import { Link } from 'react-router-dom'
import { useTheme } from '../context/useTheme'
import Logo from '../components/Logo'

const previewColumns = [
  {
    title: 'Backlog',
    count: 8,
    cards: [
      { title: 'Map project milestones', tag: 'Planning', status: 'Ready', assignee: 'JS', due: 'Aug 31', tone: 'teal' },
      { title: 'Collect customer notes', tag: 'Research', status: 'Draft', assignee: 'AL', due: 'Sep 2', tone: 'amber' },
      { title: 'Scope mobile project view', tag: 'Design', status: 'Next', assignee: 'DK', due: 'Sep 4', tone: 'cyan' },
    ],
  },
  {
    title: 'In Progress',
    count: 3,
    cards: [
      { title: 'Realtime drag persistence', tag: 'Core', status: 'Today', assignee: 'JS', due: 'Today', tone: 'teal' },
      { title: 'Dashboard filters', tag: 'UI', status: 'Review', assignee: 'AL', due: 'Sep 1', tone: 'rose' },
    ],
  },
  {
    title: 'Done',
    count: 12,
    cards: [
      { title: 'Auth and project access', tag: 'API', status: 'Shipped', assignee: 'DK', due: 'Done', tone: 'cyan' },
      { title: 'List ordering system', tag: 'Core', status: 'Shipped', assignee: 'JS', due: 'Done', tone: 'teal' },
    ],
  },
]

const features = [
  {
    title: 'Project workspaces',
    text: 'Create one project for the product you are building, then organize the actual work inside focused workflows.',
    icon: 'layout',
  },
  {
    title: 'Workflow templates',
    text: 'Start with Software Sprint, Bug Triage, Release Plan, API Roadmap, or a completely custom workflow.',
    icon: 'template',
  },
  {
    title: 'Task detail modal',
    text: 'Capture descriptions, comments, tags, status, assignees, and due dates on each card.',
    icon: 'detail',
  },
  {
    title: 'Realtime project chat',
    text: 'Keep quick project decisions beside the board with live messages, unread counts, and owner-controlled chat clearing.',
    icon: 'chat',
  },
  {
    title: 'Activity timeline',
    text: 'Track project changes from one global activity view or inside a specific project.',
    icon: 'activity',
  },
  {
    title: 'Realtime sync',
    text: 'Move cards, edit tasks, add workflows, and keep every connected member in sync without refreshing.',
    icon: 'flow',
  },
  {
    title: 'Search and filters',
    text: 'Focus work by task title, tag, or status when the project starts to fill up.',
    icon: 'filter',
  },
  {
    title: 'Role-based spaces',
    text: 'Invite members by email and manage owner, admin, and member permissions.',
    icon: 'shield',
  },
  {
    title: 'Personal cockpit',
    text: 'Review owned, shared, and assigned work from a profile-aware workspace.',
    icon: 'target',
  },
  {
    title: 'Project controls',
    text: 'Rename or delete projects, workflows, lists, and cards as your project shape changes.',
    icon: 'settings',
  },
]

const workflow = ['Capture', 'Prioritise', 'Build', 'Review', 'Ship']

const workflowTemplates = [
  { title: 'Software Sprint', meta: 'Backlog to shipped', tone: 'teal' },
  { title: 'Bug Triage', meta: 'Report, verify, fix', tone: 'rose' },
  { title: 'Release Plan', meta: 'Scope, QA, launch', tone: 'amber' },
  { title: 'Custom Workflow', meta: 'Start from blank', tone: 'cyan' },
]

const activity = [
  { person: 'JS', action: 'moved Realtime drag persistence to Review', time: '2m ago' },
  { person: 'AL', action: 'commented on Dashboard filters', time: '9m ago' },
  { person: 'DK', action: 'assigned Auth and project access to John Smith', time: '18m ago' },
]

const taskHighlights = [
  { label: 'Status', value: 'In Review', tone: 'teal' },
  { label: 'Tag', value: 'Realtime', tone: 'cyan' },
  { label: 'Assignee', value: 'John Smith', tone: 'amber' },
  { label: 'Due date', value: 'Today', tone: 'rose' },
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
        <section className="relative mx-auto grid min-h-[calc(100vh-66px)] max-w-[92rem] items-center gap-10 px-5 pb-16 pt-10 sm:px-8 xl:grid-cols-[0.68fr_1.32fr] xl:gap-12">
          <div className="landing-grid" />

          <div className="relative z-10 max-w-xl xl:max-w-lg">
            <p className="landing-rise mb-4 inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
              Project command center
            </p>
            <h1 className="landing-rise landing-delay-1 text-4xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl dark:text-white">
              Bring your projects into one live workspace.
            </h1>
            <p className="landing-rise landing-delay-2 mt-5 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              SDLCFlow gives each project a home, then lets you add the workflows, tasks, chat, and live activity you need to keep delivery moving.
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
              <Stat value="Projects" label="as containers" />
              <Stat value="Workflows" label="inside each project" />
              <Stat value="Chat" label="beside the work" />
            </div>
          </div>

          <HeroBoard />
        </section>

        <section className="border-y border-zinc-200 bg-stone-100 py-20 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Cards</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">Every task can carry the context behind the work.</h2>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Open a card to add the details that keep delivery moving: what it means, who owns it, when it is due, what status it is in, and what changed recently.
              </p>
            </div>

            <div className="landing-feature rounded-xl border border-zinc-200 bg-white p-5 shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Card detail</p>
                  <h3 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-white">Prepare API release notes</h3>
                </div>
                <span className="landing-pulse rounded-full bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-800 dark:bg-teal-400 dark:text-zinc-950">Synced</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Add status, tags, assignee, due date, and discussion context so a card can move across any workflow without losing the why.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {taskHighlights.map((item) => (
                  <div key={item.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{item.label}</p>
                    <p className={`mt-1 text-sm font-semibold ${highlightClass(item.tone)}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Comments</p>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Ready for review once QA signs off on the final endpoint list.</p>
              </div>
            </div>
          </div>
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
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-300">Workflows</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">One project can hold every type of work.</h2>
                <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Add a sprint, bug triage, release plan, API roadmap, or custom workflow inside the same project. Each workflow keeps its own lists and cards, while the project stays easy to understand.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {workflowTemplates.map((template, index) => (
                    <div key={template.title} className="landing-feature rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900" style={{ animationDelay: `${index * 110}ms` }}>
                      <span className={tagClass(template.tone)}>{template.title}</span>
                      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{template.meta}</p>
                    </div>
                  ))}
                </div>
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
                SDLCFlow is designed around shared state: cards move, workflows update, chat stays live, and collaborators stay oriented without refreshing or asking what changed.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <StatDark value="3" label="active members" />
                <StatDark value="24" label="open tasks" />
                <StatDark value="4" label="workflows" />
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
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">Start with one project, then add the workflows you need.</h2>
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
    <div className="landing-board relative z-10 min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-300/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">Uptime Desk</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Software Sprint · Bug Triage · 18 open tasks</p>
        </div>
        <div className="flex -space-x-2">
          {['JS', 'AL', 'DK'].map((person) => (
            <span key={person} className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-zinc-900 text-[11px] font-semibold text-white dark:border-zinc-900">
              {person}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {previewColumns.map((column, columnIndex) => (
            <div key={column.title} className="min-h-[420px] rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
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
                    <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 font-semibold text-white dark:bg-white dark:text-zinc-950">{card.assignee}</span>
                      <span>{card.due}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden min-h-[452px] flex-col border-l border-zinc-200 bg-white text-xs dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
          <LandingChatPreview />
        </div>
      </div>

      <div className="landing-cursor absolute right-[34%] top-[42%] hidden rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg dark:bg-white dark:text-zinc-950 md:block">
        John editing
      </div>
    </div>
  )
}

function LandingChatPreview() {
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Project chat</p>
          <p className="mt-0.5 truncate font-semibold text-zinc-950 dark:text-zinc-100">Uptime Desk</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="landing-pulse h-1.5 w-1.5 rounded-full bg-teal-500" />
            Live messages active
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md px-1.5 py-1 font-semibold text-zinc-500 dark:text-zinc-400">Clear</span>
          <span className="grid h-6 w-6 place-items-center rounded-md text-zinc-400">x</span>
        </div>
      </div>
      <div className="flex-1 space-y-3 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">Today</span>
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="flex items-end gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-950 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">AL</span>
          <div className="max-w-[78%] rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
              <span className="font-semibold">Alex Lee</span>
              <span>10:24</span>
            </div>
            <p>API task is ready for review.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[78%] rounded-lg border border-teal-600 bg-teal-600 px-2.5 py-2 text-white">
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-teal-50/80">
              <span className="font-semibold">You</span>
              <span className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="m19 6-1 14H6L5 6" />
                </svg>
                10:25
              </span>
            </div>
            <p className="font-medium">Moving it to Review now.</p>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
        <div className="flex items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="min-h-8 flex-1 px-1 py-1 text-zinc-400">Message this project</span>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-600 text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </span>
        </div>
      </div>
    </>
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
    template: <><path d="M4 5a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M8 10h8" /><path d="M8 14h5" /></>,
    flow: <><path d="M5 6h9a4 4 0 0 1 0 8H8" /><path d="m8 10-4 4 4 4" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    detail: <><path d="M8 4h8l4 4v12H4V4h4Z" /><path d="M14 4v5h5" /><path d="M8 13h8" /><path d="M8 17h5" /></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
    filter: <><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></>,
    shield: <><path d="M12 3 20 7v5c0 5-3.4 8.1-8 9-4.6-.9-8-4-8-9V7l8-4Z" /><path d="m9 12 2 2 4-5" /></>,
    settings: <><path d="M4 7h16" /><path d="M4 17h16" /><path d="M8 4v6" /><path d="M16 14v6" /></>,
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

function highlightClass(tone) {
  const tones = {
    teal: 'text-teal-700 dark:text-teal-300',
    amber: 'text-amber-700 dark:text-amber-300',
    cyan: 'text-cyan-700 dark:text-cyan-300',
    rose: 'text-rose-700 dark:text-rose-300',
  }

  return tones[tone]
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
