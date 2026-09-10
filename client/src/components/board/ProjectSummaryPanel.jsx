import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { boardApi } from '../../lib/api'
import { useLatestRequest } from '../../hooks/useLatestRequest'

const SECTIONS = [ ['completed', 'Completed', 'text-teal-700 dark:text-teal-300'], ['inProgress', 'In progress', 'text-sky-700 dark:text-sky-300'], ['blocked', 'Blocked', 'text-rose-700 dark:text-rose-300'] ]

export default function ProjectSummaryPanel({ board, token, onClose }) {
  const [summary, setSummary] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const dialog = useRef(null)
  const beginRead = useLatestRequest()
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.querySelector('button').focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  async function generate() {
    if (busy.current) return
    busy.current = true
    const isCurrent = beginRead('summary')
    setPending(true)
    setError('')
    try {
      const res = await boardApi.summarize(board._id, token)
      if (isCurrent()) setSummary(res.data.summary)
    } catch (err) {
      if (isCurrent()) {
        // Drop the old snapshot on access failure instead of displaying private
        // history alongside a revoked-membership error.
        if ([401, 403, 404].includes(err.status)) setSummary(null)
        setError(err.message)
      }
    } finally {
      if (isCurrent()) { setPending(false); busy.current = false }
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key !== 'Tab') return
    const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), a[href]')]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/35 backdrop-blur-sm sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby="summary-title" onKeyDown={onKeyDown} className="flex h-full w-full max-w-xl flex-col overflow-hidden border border-zinc-200 bg-white text-zinc-950 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:rounded-lg">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div className="min-w-0"><p className="text-xs font-semibold text-teal-700 dark:text-teal-300">AI summary</p><h2 id="summary-title" className="mt-1 break-words text-lg font-semibold">{board.name}</h2></div>
          <button type="button" onClick={onClose} aria-label="Close summary" title="Close summary" className="shrink-0 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">Generating sends task titles, statuses, and description excerpts to OpenAI: up to 20 recently updated tasks per status across all workflows. Chat and GitHub data are excluded.</p>
          <button type="button" disabled={pending} onClick={generate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"><Sparkles size={16} />{pending ? 'Summarizing...' : summary ? 'Regenerate summary' : 'Generate summary'}</button>
          {pending && <p role="status" className="text-sm text-zinc-500">Preparing your project summary...</p>}
          {error && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-300">{error}</p>}
          {summary && (
            <div className="space-y-5">
              <p className="text-xs leading-5 text-zinc-500">Snapshot from {new Date(summary.sampledAt).toLocaleString()}. AI-generated; verify against linked cards. Completed means currently Done, not completed during a specific period.</p>
              {summary.empty && <p className="text-sm">No completed, in-progress, or blocked tasks to summarize.</p>}
              {SECTIONS.map(([key, label, color]) => (
                <section key={key} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
                  <p className="mt-1 text-xs text-zinc-500">{summary.scope[key].included} tasks included{summary.scope[key].truncated ? '; more tasks omitted' : ''}</p>
                  {summary.sections[key].length === 0 ? <p className="mt-2 text-sm text-zinc-500">No tasks in this status.</p> : (
                    <ul className="mt-3 space-y-4">{summary.sections[key].map((bullet, index) => (
                      <li key={index} className="min-w-0"><p className="break-words text-sm leading-6">{bullet.text}</p><ul className="mt-1 space-y-1">{bullet.cards.map((card) => <li key={card.id}><Link className="break-words text-sm text-teal-700 underline underline-offset-2 dark:text-teal-300" to={`/boards/${board._id}?card=${encodeURIComponent(card.id)}`}>{card.title}</Link></li>)}</ul></li>
                    ))}</ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
