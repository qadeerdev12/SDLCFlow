import { useEffect, useState } from 'react'
import {
  BOARD_COLOR_KEYS,
  DEFAULT_COLOR,
  DEFAULT_EMOJI,
  EMOJI_CHOICES,
  colorClasses,
} from '../lib/boardColors'
import { tagStyle, statusDotStyle } from '../lib/cardMeta'
import { useToast } from '../context/useToast'
import BoardIcon from './BoardIcon'

// Board creation lives in a dialog rather than a permanent form at the top of
// the dashboard — creating a board is occasional, browsing them is constant.
// The dashboard mounts this only while open, so the form starts clean every
// time and needs no reset. `onCreate` returns a promise; we stay open and show
// the message if it rejects.
export default function NewBoardModal({
  board,
  templates = [],
  templatesLoading = false,
  templatesError = '',
  onClose,
  onCreate,
}) {
  const editing = Boolean(board)
  const toast = useToast()
  const [name, setName] = useState(board?.name || '')
  const [emoji, setEmoji] = useState(board?.emoji || DEFAULT_EMOJI)
  const [color, setColor] = useState(board?.color || DEFAULT_COLOR)
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const selectedTemplate = templates.find((template) => template.id === templateId)

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
      await onCreate(name.trim(), { emoji, color, templateId: templateId || undefined })
      onClose()
    } catch (err) {
      setError(err.message)
      toast.error(editing ? 'Could not update board' : 'Could not create board', err.message)
      setSubmitting(false)
    }
  }

  function chooseTemplate(template) {
    if (editing) return
    setTemplateId(template?.id || '')

    if (!template) return
    if (!name.trim()) setName(template.name)
    if (template.emoji) setEmoji(template.emoji)
    if (template.color) setColor(template.color)
  }

  const c = colorClasses(color)
  const modalWidth = editing ? 'max-w-md' : 'max-w-5xl'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm dark:bg-black/70"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit board' : 'Create a board'}
        className={`max-h-[90vh] w-full ${modalWidth} overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900`}
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

          <div className={`grid gap-5 px-5 py-5 ${editing ? '' : 'lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]'}`}>
            {!editing && (
              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Templates</p>
                    <h3 className="mt-1 text-sm font-semibold text-zinc-950 dark:text-zinc-100">Choose a starting workflow</h3>
                  </div>
                  <span className="rounded-full border border-zinc-200 px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {templatesLoading ? 'Loading' : `${templates.length} ready`}
                  </span>
                </div>

                <div className="grid max-h-[54vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  <BlankTemplateCard active={!templateId} onSelect={() => chooseTemplate(null)} />

                  {templatesLoading && Array.from({ length: 3 }).map((_, index) => (
                    <TemplateSkeleton key={index} />
                  ))}

                  {!templatesLoading && templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      active={templateId === template.id}
                      onSelect={() => chooseTemplate(template)}
                    />
                  ))}
                </div>

                {templatesError && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    Templates could not load. You can still start blank.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-5">
              {/* Live preview of the tile that will land in the grid. */}
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ${c.gradient}`}>
                    <BoardIcon value={emoji} className="h-5 w-5" />
                  </span>
                  <span className={`min-w-0 truncate font-semibold ${name.trim() ? 'text-zinc-950 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-600'}`}>
                    {name.trim() || 'Project board name'}
                  </span>
                </div>
                {!editing && selectedTemplate && (
                  <p className="mt-3 border-t border-zinc-200 pt-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    Starts with {selectedTemplate.lists.length} lists and {selectedTemplate.cards.length} starter cards.
                  </p>
                )}
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
                      key={choice.value}
                      type="button"
                      onClick={() => setEmoji(choice.value)}
                      aria-label={choice.label}
                      title={choice.label}
                      aria-pressed={emoji === choice.value}
                      className={`grid h-9 w-9 place-items-center rounded-lg text-zinc-600 transition dark:text-zinc-300 ${
                        emoji === choice.value
                          ? 'bg-teal-50 ring-2 ring-teal-600 dark:bg-teal-500/15 dark:ring-teal-400'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <BoardIcon value={choice.value} className="h-[18px] w-[18px]" />
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
            </section>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300 lg:col-span-2">
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

function cardCountLabel(count) {
  return `${count} starter ${count === 1 ? 'card' : 'cards'}`
}

function TemplateCard({ template, active, onSelect }) {
  const c = colorClasses(template.color)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group rounded-lg border p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/15 dark:border-teal-400 dark:bg-teal-500/10'
          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ${c.gradient}`}>
            <BoardIcon value={template.icon || template.emoji} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{template.name}</span>
            <span className="mt-0.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {template.lists.length} lists, {cardCountLabel(template.cards.length)}
            </span>
          </span>
        </div>
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
          active ? 'border-teal-600 bg-teal-600 dark:border-teal-300 dark:bg-teal-300' : 'border-zinc-300 dark:border-zinc-700'
        }`} />
      </div>

      <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">{template.summary}</p>

      <div className="mt-3 flex gap-1 overflow-hidden">
        {template.lists.slice(0, 5).map((list) => (
          <span key={list} className="h-1.5 min-w-8 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800" title={list} />
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {template.cards.slice(0, 2).map((card) => (
          <div key={`${template.id}-${card.title}`} className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="flex items-center justify-between gap-2 text-left">
              <span className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">{card.title}</span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotStyle(card.status)}`} />
            </span>
            <span className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${tagStyle(card.tag)}`}>
              {card.tag}
            </span>
          </div>
        ))}
      </div>
    </button>
  )
}

function BlankTemplateCard({ active, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group rounded-lg border p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/15 dark:border-teal-400 dark:bg-teal-500/10'
          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <BoardIcon value="code" className="h-[18px] w-[18px]" />
          </span>
          <span className="text-left">
            <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-100">Start blank</span>
            <span className="mt-0.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Custom workflow</span>
          </span>
        </div>
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
          active ? 'border-teal-600 bg-teal-600 dark:border-teal-300 dark:bg-teal-300' : 'border-zinc-300 dark:border-zinc-700'
        }`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        Create an empty board and add lists, cards, labels, and statuses yourself.
      </p>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className="h-1.5 flex-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700" />
        ))}
      </div>
      <span className="mt-3 block rounded-md border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] font-semibold text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        No starter cards
      </span>
    </button>
  )
}

function TemplateSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex-1">
          <div className="h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
        </div>
      </div>
      <div className="mt-4 h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
      <div className="mt-4 flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-1.5 flex-1 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}
