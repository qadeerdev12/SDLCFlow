import { colorClasses, DEFAULT_EMOJI } from '../lib/boardColors'
import { relativeTime } from '../lib/time'

const ROLE_BADGE = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  admin: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
  member: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

export default function BoardCard({ board, role, onOpen }) {
  const c = colorClasses(board.color)
  const memberCount = board.members?.length ?? 0

  return (
    <button
      onClick={onOpen}
      className={`group flex min-h-[170px] flex-col justify-between rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 ${c.glow}`}
    >
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-lg shadow-sm ${c.gradient}`}>
            {board.emoji || DEFAULT_EMOJI}
          </span>
          <span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${c.dot}`} />
        </div>

        <h3 className="line-clamp-2 text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-100">{board.name}</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Updated {relativeTime(board.updatedAt)}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
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
    </button>
  )
}
