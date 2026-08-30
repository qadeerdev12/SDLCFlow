import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { boardApi } from '../lib/api'
import { DEFAULT_EMOJI } from '../lib/boardColors'

// A dropdown in the board header that lists all of the user's boards and lets
// them jump straight to another one — no trip back to the dashboard.
// The Board model already supports one user owning many boards, so this is
// purely a client concern: it reuses boardApi.list and navigates on select.
export default function BoardSwitcher({ currentBoard }) {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState([])
  const [loaded, setLoaded] = useState(false)
  const menuRef = useRef(null)

  // Fetch the board list the first time the menu is opened, then cache it.
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    async function loadBoards() {
      try {
        const res = await boardApi.list(token)
        if (!cancelled) {
          setBoards(res.data.boards)
          setLoaded(true)
        }
      } catch {
        // Non-fatal: the switcher just stays empty. The board itself still loads.
        if (!cancelled) setLoaded(true)
      }
    }
    loadBoards()
    return () => { cancelled = true }
  }, [open, loaded, token])

  // Close the dropdown when clicking anywhere outside of it.
  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function goToBoard(boardId) {
    setOpen(false)
    if (boardId !== currentBoard?._id) navigate(`/boards/${boardId}`)
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[min(56vw,420px)] items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-base font-semibold text-zinc-950 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 sm:text-lg"
      >
        {currentBoard && <span className="text-base leading-none">{currentBoard.emoji || DEFAULT_EMOJI}</span>}
        <span className="truncate">{currentBoard?.name || 'Board'}</span>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-300/40 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40"
        >
          <p className="px-3 pb-1 pt-2.5 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
            Your boards
          </p>

          <div className="max-h-72 overflow-y-auto py-1">
            {!loaded ? (
              <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
            ) : boards.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">No other boards.</p>
            ) : (
              boards.map((b) => {
                const isCurrent = b._id === currentBoard?._id
                return (
                  <button
                    key={b._id}
                    onClick={() => goToBoard(b._id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800 ${isCurrent ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-800 dark:text-zinc-200'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-base leading-none">{b.emoji || DEFAULT_EMOJI}</span>
                      <span className="truncate">{b.name}</span>
                    </span>
                    {isCurrent && (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="shrink-0">
                        <path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                )
              })
            )}
          </div>

          <button
            onClick={() => { setOpen(false); navigate('/dashboard') }}
            className="flex w-full items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-teal-300 dark:hover:bg-zinc-800"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            View all boards
          </button>
        </div>
      )}
    </div>
  )
}
