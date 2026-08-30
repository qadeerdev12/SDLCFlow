import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { boardApi } from '../lib/api'
import AppHeader from '../components/AppHeader'
import BoardCard from '../components/BoardCard'
import NewBoardModal from '../components/NewBoardModal'

const SORTS = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Newest first' },
  { key: 'name', label: 'Name A-Z' },
]

export default function DashboardPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [creating, setCreating] = useState(false)
  const [editingBoard, setEditingBoard] = useState(null)

  useEffect(() => {
    async function loadBoards() {
      try {
        const res = await boardApi.list(token)
        setBoards(res.data.boards)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadBoards()
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
  }

  async function handleUpdate(board, name, options) {
    const res = await boardApi.update(board._id, { name, ...options }, token)
    setBoards((prev) => prev.map((b) => (b._id === board._id ? res.data.board : b)))
  }

  async function handleDelete(board) {
    const confirmed = window.confirm(`Delete "${board.name}" and all of its lists and cards?`)
    if (!confirmed) return

    try {
      await boardApi.delete(board._id, token)
      setBoards((prev) => prev.filter((b) => b._id !== board._id))
    } catch (err) {
      setError(err.message)
    }
  }

  const firstName = user?.name?.split(' ')[0]
  const sharedBoards = boards.filter((b) => (b.members?.length ?? 0) > 1).length

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-5 py-6 sm:px-6">
        <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Workspace</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {firstName ? `${firstName}'s projects` : 'Project dashboard'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  Track active work, reopen recent boards, and keep your planning surface close to the projects you are building.
                </p>
              </div>

              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New board
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric label="Total boards" value={loading ? '-' : boards.length} />
              <Metric label="Shared spaces" value={loading ? '-' : sharedBoards} />
              <Metric label="Current view" value={loading ? '-' : visibleBoards.length} />
            </div>
          </div>

          <aside className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Focus</p>
              <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-300">Live-ready</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold">Plan the next useful move.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Use one board per project, then keep lists lean: Backlog, Next, In Progress, Review, Done.
            </p>
          </aside>
        </section>

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project boards"
              aria-label="Search boards"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort boards"
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

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

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="min-h-[170px] animate-pulse rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-5 h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800/70" />
              </div>
            ))}
          </div>
        ) : boards.length === 0 ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : visibleBoards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">No boards match "{query}".</p>
            <button onClick={() => setQuery('')} className="mt-2 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleBoards.map((board) => (
              <BoardCard
                key={board._id}
                board={board}
                role={roleFor(board)}
                canManage={roleFor(board) === 'owner'}
                onOpen={() => navigate(`/boards/${board._id}`)}
                onEdit={setEditingBoard}
                onDelete={handleDelete}
              />
            ))}

            <button
              onClick={() => setCreating(true)}
              className="flex min-h-[170px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white text-zinc-500 transition hover:border-teal-400 hover:text-teal-700 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-500/50 dark:hover:text-teal-300"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-sm font-semibold">New board</span>
            </button>
          </div>
        )}
      </main>

      {creating && <NewBoardModal onClose={() => setCreating(false)} onCreate={handleCreate} />}
      {editingBoard && (
        <NewBoardModal
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
          onCreate={(name, options) => handleUpdate(editingBoard, name, options)}
        />
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-2xl font-semibold text-zinc-950 dark:text-white">{value}</p>
      <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-teal-600 text-white shadow-lg shadow-teal-600/20">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      </div>
      <h2 className="mt-5 text-lg font-semibold">Create your first project board</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        Start with one project, add a few lists, then drag cards as the work moves.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-teal-500"
      >
        New board
      </button>
    </div>
  )
}
