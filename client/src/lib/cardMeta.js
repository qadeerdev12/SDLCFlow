export const CARD_TAGS = ['Task', 'Feature', 'Bug', 'Design', 'Research', 'Docs', 'Chore']
export const CARD_STATUSES = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done']

export const TAG_STYLES = {
  Task: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
  Feature: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300',
  Bug: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  Design: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
  Research: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  Docs: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  Chore: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

export const STATUS_STYLES = {
  Todo: 'bg-zinc-400',
  'In Progress': 'bg-cyan-500',
  Review: 'bg-amber-500',
  Blocked: 'bg-rose-500',
  Done: 'bg-teal-500',
}

export function tagStyle(tag) {
  return TAG_STYLES[tag] || TAG_STYLES.Task
}

export function statusDotStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.Todo
}
