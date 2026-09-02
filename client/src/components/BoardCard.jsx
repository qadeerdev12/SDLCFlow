import { useEffect, useRef, useState } from 'react'
import { colorClasses, DEFAULT_EMOJI } from '../lib/boardColors'
import { relativeTime } from '../lib/time'
import BoardIcon from './BoardIcon'

const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  admin: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
  member: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

export default function BoardCard({ board, role, canEdit, canDelete, onOpen, onEdit, onDelete }) {
  const c = colorClasses(board.color)
  const memberCount = board.members?.length ?? 0
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <div className={`group relative flex min-h-[170px] flex-col justify-between rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 ${c.glow}`}>
      <button type="button" onClick={onOpen} className="absolute inset-0 rounded-lg" aria-label={`Open ${board.name}`} />

      <div className="relative pointer-events-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            className={`pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ${c.gradient}`}
            aria-label={`Open ${board.name}`}
          >
            <BoardIcon value={board.emoji || DEFAULT_EMOJI} className="h-5 w-5" />
          </button>
          <div className="pointer-events-auto relative" ref={menuRef}>
            {canEdit || canDelete ? (
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={`Open ${board.name} actions`}
                className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            ) : (
              <span className={`mt-0.5 block h-2.5 w-2.5 rounded-full ${c.dot}`} />
            )}

            {(canEdit || canDelete) && menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(board)
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Edit project
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete(board)
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Delete project
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <h3 className="line-clamp-2 text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-100">{board.name}</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Updated {relativeTime(board.updatedAt)}
        </p>
      </div>

      <div className="pointer-events-none relative mt-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {role && (
            <span className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize ${ROLE_BADGE[role] || ROLE_BADGE.member}`}>
              {role}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {memberCount}
          </span>
        </div>

        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-400 transition group-hover:border-teal-200 group-hover:bg-teal-50 group-hover:text-teal-700 dark:border-zinc-800 dark:group-hover:border-teal-500/20 dark:group-hover:bg-teal-500/10 dark:group-hover:text-teal-300">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </div>
  )
}
