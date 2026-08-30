import { useEffect, useState } from 'react'
import {
  BOARD_COLOR_KEYS,
  DEFAULT_COLOR,
  DEFAULT_EMOJI,
  EMOJI_CHOICES,
  colorClasses,
} from '../lib/boardColors'

// Board creation lives in a dialog rather than a permanent form at the top of
// the dashboard — creating a board is occasional, browsing them is constant.
// The dashboard mounts this only while open, so the form starts clean every
// time and needs no reset. `onCreate` returns a promise; we stay open and show
// the message if it rejects.
export default function NewBoardModal({ board, onClose, onCreate }) {
  const editing = Boolean(board)
  const [name, setName] = useState(board?.name || '')
  const [emoji, setEmoji] = useState(board?.emoji || DEFAULT_EMOJI)
  const [color, setColor] = useState(board?.color || DEFAULT_COLOR)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || submitting) return

    setSubmitting(true)
    setError('')
    try {
      await onCreate(name.trim(), { emoji, color })
      onClose()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const c = colorClasses(color)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm dark:bg-black/70"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit board' : 'Create a board'}
        className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div>
              <h2 className="font-semibold text-zinc-950 dark:text-zinc-100">
                {editing ? 'Edit project board' : 'Create project board'}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {editing ? 'Update the board name and visual identity.' : 'Set the space your tasks will live in.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            {/* Live preview of the tile that will land in the grid. */}
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-xl shadow-sm ${c.gradient}`}>
                {emoji}
              </span>
              <span className={`truncate font-semibold ${name.trim() ? 'text-zinc-950 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-600'}`}>
                {name.trim() || 'Project board name'}
              </span>
            </div>

            <div>
              <label htmlFor="board-name" className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Name
              </label>
              <input
                id="board-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Client portal rebuild"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Icon</p>
              <div className="flex flex-wrap gap-1">
                {EMOJI_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setEmoji(choice)}
                    aria-pressed={emoji === choice}
                    className={`h-9 w-9 rounded-lg text-base leading-none transition ${
                      emoji === choice
                        ? 'bg-teal-50 ring-2 ring-teal-600 dark:bg-teal-500/15 dark:ring-teal-400'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Color</p>
              <div className="flex gap-2">
                {BOARD_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setColor(key)}
                    aria-label={`${key} colour`}
                    aria-pressed={color === key}
                    className={`h-7 w-7 rounded-full transition ${colorClasses(key).swatch} ${
                      color === key
                        ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-zinc-900'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save changes' : 'Create board')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
