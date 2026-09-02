import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { boardApi } from '../lib/api'
import AppHeader from '../components/AppHeader'
import BoardCard from '../components/BoardCard'
import ConfirmDialog from '../components/ConfirmDialog'
import NewBoardModal from '../components/NewBoardModal'

const SORTS = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Newest first' },
  { key: 'name', label: 'Name A-Z' },
]

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export default function DashboardPage() {
  const { user, token } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [creating, setCreating] = useState(false)
  const [editingBoard, setEditingBoard] = useState(null)
  const [boardDeleteTarget, setBoardDeleteTarget] = useState(null)
  const [boardDeleting, setBoardDeleting] = useState(false)

  useEffect(() => {
    async function loadDashboard() {
      try {
        const boardsRes = await boardApi.list(token)
        setBoards(boardsRes.data.boards)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }

    }
    loadDashboard()
  }, [token])

  const visibleBoards = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : boards

    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt)
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    })
  }, [boards, query, sort])

  function roleFor(board) {
    return board.members?.find((m) => String(m.user) === String(user?.id))?.role
  }

  async function handleCreate(name, options) {
    const res = await boardApi.create(name, token, options)
    setBoards((prev) => [res.data.board, ...prev])
    toast.success('Project created', res.data.board.name)
  }

  async function handleUpdate(board, name, options) {
    const res = await boardApi.update(board._id, { name, ...options }, token)
    setBoards((prev) => prev.map((b) => (b._id === board._id ? res.data.board : b)))
    toast.success('Project updated', res.data.board.name)
  }

  async function handleDelete(board) {
    setBoardDeleteTarget(board)
  }

  async function confirmDeleteBoard() {
    if (!boardDeleteTarget) return
    const board = boardDeleteTarget
    setBoardDeleting(true)
    try {
      await boardApi.delete(board._id, token)
      setBoards((prev) => prev.filter((b) => b._id !== board._id))
      toast.success('Project deleted', board.name)
      setBoardDeleteTarget(null)
    } catch (err) {
      setError(err.message)
      toast.error('Could not delete project', err.message)
    } finally {
      setBoardDeleting(false)
    }
  }

  const firstName = user?.name?.split(' ')[0]
  const sharedBoards = boards.filter((b) => (b.members?.length ?? 0) > 1).length
  const ownedBoards = boards.filter((b) => roleFor(b) === 'owner').length
  const hasFilters = Boolean(query.trim())

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <AppHeader />

      <main className="mx-auto max-w-[1760px] px-4 py-5 sm:px-6 lg:py-7 2xl:px-8">
        <section className="mb-5 rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="flex min-w-0 flex-col justify-between gap-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Workspace</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {firstName ? `${firstName}'s projects` : 'Project dashboard'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Open a project, review active spaces, or create a clean container for your next build.
                  </p>
                </div>

                <button
                  onClick={() => setCreating(true)}
                  className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500 sm:w-auto"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>New project</span>
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Total projects" value={loading ? '-' : boards.length} />
                <Metric label="Owned by you" value={loading ? '-' : ownedBoards} />
                <Metric label="Shared spaces" value={loading ? '-' : sharedBoards} />
                <Metric label="Current view" value={loading ? '-' : visibleBoards.length} />
              </div>
            </div>

            <aside className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-white dark:border-zinc-800">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Quick start</p>
                  <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-300">
                    Workflows inside
                  </span>
                </div>
                <h2 className="mt-4 text-lg font-semibold">Create the project first.</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Each project starts with a General workflow. Add Sprint, Bug Triage, Release Plan, or custom workflows once you are inside.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-5 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-teal-50"
              >
                New project
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </aside>
          </div>
        </section>

        <section className="mb-5 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Clear search
                </button>
              )}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort projects"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-100 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-200 dark:hover:bg-teal-500/15"
              >
                <PlusIcon className="h-4 w-4" />
                New project
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-100">Projects</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {loading ? 'Loading your workspace...' : `${pluralize(visibleBoards.length, 'project')} shown`}
              </p>
            </div>
          </div>

          {loading ? (
            <BoardGridSkeleton />
          ) : boards.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : visibleBoards.length === 0 ? (
            <NoSearchResults query={query} onClear={() => setQuery('')} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleBoards.map((board) => (
                <BoardCard
                  key={board._id}
                  board={board}
                  role={roleFor(board)}
                  canEdit={['owner', 'admin'].includes(roleFor(board))}
                  canDelete={roleFor(board) === 'owner'}
                  onOpen={() => navigate(`/boards/${board._id}`)}
                  onEdit={setEditingBoard}
                  onDelete={handleDelete}
                />
              ))}

              <CreateBoardTile onCreate={() => setCreating(true)} />
            </div>
          )}
        </section>
      </main>

      {creating && (
        <NewBoardModal
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}
      {editingBoard && (
        <NewBoardModal
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
          onCreate={(name, options) => handleUpdate(editingBoard, name, options)}
        />
      )}

      {boardDeleteTarget && (
        <ConfirmDialog
          title={`Delete "${boardDeleteTarget.name}"?`}
          description="This will permanently delete the project, its workflow lists, cards, comments, chat messages, and activity history."
          confirmLabel="Delete project"
          pending={boardDeleting}
          onCancel={() => setBoardDeleteTarget(null)}
          onConfirm={confirmDeleteBoard}
        />
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xl font-semibold text-zinc-950 dark:text-white sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function BoardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="min-h-[180px] animate-pulse rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/70" />
          </div>
          <div className="mt-6 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800/70" />
          <div className="mt-7 h-8 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/70" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-teal-600 text-white shadow-lg shadow-teal-600/20">
        <LayoutIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">Create your first project</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        Start with a clean project container. Inside it, you can add workflows for sprints, bugs, releases, roadmaps, and custom work.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500"
      >
        <PlusIcon className="h-4 w-4" />
        New project
      </button>
    </div>
  )
}

function NoSearchResults({ query, onClear }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white py-14 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-zinc-500 dark:text-zinc-400">No projects match "{query}".</p>
      <button onClick={onClear} className="mt-2 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
        Clear search
      </button>
    </div>
  )
}

function CreateBoardTile({ onCreate }) {
  return (
    <button
      onClick={onCreate}
      className="flex min-h-[180px] flex-col justify-between rounded-lg border border-dashed border-zinc-300 bg-white p-4 text-left text-zinc-500 transition hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-700 hover:shadow-lg hover:shadow-teal-600/10 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-500/50 dark:hover:text-teal-300"
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
        <PlusIcon className="h-5 w-5" />
      </span>
      <span>
        <span className="block whitespace-nowrap text-sm font-semibold text-zinc-800 dark:text-zinc-100">New project</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Create a project container and add workflows inside.
        </span>
      </span>
    </button>
  )
}

function PlusIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SearchIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ArrowRightIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

function LayoutIcon({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )
}
