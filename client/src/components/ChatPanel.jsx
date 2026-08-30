import { useEffect, useRef, useState } from 'react'

function userId(value) {
  return value?.id || value?._id || value
}

function senderName(sender) {
  return sender?.name || sender?.email || 'Unknown user'
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

function messageTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toDateString()
}

function dateLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const daysAgo = Math.round((today - target) / 86_400_000)

  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ChatPanel({
  board,
  messages,
  loading,
  error,
  currentUserId,
  connected,
  currentRole,
  onClose,
  onRetry,
  onSendMessage,
  onDeleteMessage,
  onClearMessages,
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [clearing, setClearing] = useState(false)
  const listRef = useRef(null)
  const canClearChat = currentRole === 'owner'

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function handleSubmit(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return

    setSending(true)
    try {
      await onSendMessage(body)
      setDraft('')
    } catch {
      // The parent owns the error message so it can also trigger a toast.
    } finally {
      setSending(false)
    }
  }

  function handleComposerKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }

  async function handleDeleteMessage(message) {
    const confirmed = window.confirm('Delete this chat message?')
    if (!confirmed) return

    setDeletingId(message._id)
    try {
      await onDeleteMessage(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleClearMessages() {
    const confirmed = window.confirm('Clear all chat messages for this board? This cannot be undone in the UI.')
    if (!confirmed) return

    setClearing(true)
    try {
      await onClearMessages()
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/35 backdrop-blur-sm dark:bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Board chat</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-100">{board?.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-teal-500' : 'bg-zinc-400'}`} />
              {connected ? 'Live messages active' : 'Offline: sending uses REST when available'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canClearChat && messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearMessages}
                disabled={clearing}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-300"
              >
                Clear
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              <p>{error}</p>
              <button type="button" onClick={onRetry} className="mt-2 text-xs font-bold uppercase tracking-[0.12em]">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && messages.length === 0 && (
            <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  </svg>
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Start the board conversation.</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Share decisions, blockers, and quick project notes with everyone on this board.</p>
              </div>
            </div>
          )}

          {!loading && !error && messages.map((message, index) => {
            const isMine = String(userId(message.sender)) === String(currentUserId)
            const name = senderName(message.sender)
            const isDeleted = Boolean(message.deletedAt)
            const canDelete = !isDeleted && (isMine || ['owner', 'admin'].includes(currentRole))
            const showDateLabel = dateKey(message.createdAt) !== dateKey(messages[index - 1]?.createdAt)
            return (
              <div key={message._id}>
                {showDateLabel && (
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                      {dateLabel(message.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                )}
                <article className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-950 text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
                      {initials(name)}
                    </span>
                  )}
                  <div className={`max-w-[78%] rounded-lg border px-3 py-2 ${isMine ? 'border-teal-600 bg-teal-600 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'}`}>
                    <div className={`mb-1 flex items-center justify-between gap-3 text-[11px] ${isMine ? 'text-teal-50/80' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      <span className="truncate font-semibold">{isMine ? 'You' : name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(message)}
                            disabled={deletingId === message._id}
                            className={`${isMine ? 'text-teal-50/70 hover:text-white' : 'text-zinc-400 hover:text-red-600 dark:hover:text-red-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                            aria-label="Delete message"
                            title="Delete message"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="m19 6-1 14H6L5 6" />
                            </svg>
                          </button>
                        )}
                        {messageTime(message.createdAt)}
                      </span>
                    </div>
                    {isDeleted ? (
                      <p className={`text-sm italic leading-5 ${isMine ? 'text-teal-50/80' : 'text-zinc-400 dark:text-zinc-500'}`}>Message deleted</p>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                    )}
                  </div>
                </article>
              </div>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <label htmlFor="board-chat-message" className="sr-only">Message</label>
          <div className="flex items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-900">
            <textarea
              id="board-chat-message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={2}
              maxLength={2000}
              placeholder="Message this board"
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-600 text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
