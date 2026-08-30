// Short relative timestamps for board metadata ("Updated 3h ago").
// Falls back to an absolute date once something is more than a week old,
// where "8d ago" stops being more useful than the date itself.
export function relativeTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
