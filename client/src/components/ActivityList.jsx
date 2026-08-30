const ACTION_LABELS = {
  'board.updated': 'updated the board',
  'list.created': 'created a list',
  'list.updated': 'updated a list',
  'list.moved': 'moved a list',
  'list.deleted': 'deleted a list',
  'card.created': 'created a card',
  'card.updated': 'updated a card',
  'card.moved': 'moved a card',
  'card.deleted': 'deleted a card',
  'comment.created': 'commented on a card',
  'member.added': 'added a member',
  'member.role_updated': 'changed a member role',
  'member.removed': 'removed a member',
}

function actorName(activity) {
  return activity.actor?.name || activity.actor?.email || 'Someone'
}

function activityTime(activity) {
  const date = new Date(activity.createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function activityTitle(activity) {
  if (!activity.targetTitle) return null
  if (activity.action === 'member.role_updated' && activity.metadata?.role) {
    return `${activity.targetTitle} to ${activity.metadata.role}`
  }
  if (activity.action === 'member.added' && activity.metadata?.role) {
    return `${activity.targetTitle} as ${activity.metadata.role}`
  }
  return activity.targetTitle
}

export default function ActivityList({
  activities,
  loading,
  error,
  onRetry,
  emptyTitle = 'Activity will appear here.',
  emptyDescription = 'Create or move work and the board timeline will start filling in.',
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-lg px-3 py-3">
            <div className="flex gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span>{error}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 font-semibold hover:underline">
              Retry
            </button>
          )}
        </div>
      )}

      {activities.length === 0 ? (
        <div className="grid h-full min-h-72 place-items-center rounded-lg border border-dashed border-zinc-300 px-5 text-center dark:border-zinc-800">
          <div>
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h4l3 8 4-16 3 8h4" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{emptyTitle}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{emptyDescription}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => {
            const title = activityTitle(activity)
            return (
              <article key={activity._id} className="rounded-lg px-3 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <div className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-950 text-[11px] font-bold text-white dark:bg-white dark:text-zinc-950">
                    {actorName(activity).slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-700 dark:text-zinc-200">
                      <span className="font-semibold text-zinc-950 dark:text-zinc-100">{actorName(activity)}</span>{' '}
                      {ACTION_LABELS[activity.action] || 'updated the board'}
                    </p>
                    {activity.boardName && <p className="mt-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">{activity.boardName}</p>}
                    {title && <p className="mt-0.5 truncate text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</p>}
                    <time className="mt-1 block text-xs text-zinc-400 dark:text-zinc-500">{activityTime(activity)}</time>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
