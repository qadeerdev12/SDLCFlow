import { useEffect } from 'react'

// Shared destructive-action confirmation. Keep this generic so board, card,
// member, chat, and account flows can reuse one accessible alert dialog.
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, pending])

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-zinc-950/40 px-4 backdrop-blur-sm dark:bg-black/65"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onCancel() }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl shadow-zinc-950/20 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-zinc-950 dark:text-zinc-100">{title}</h2>
            <p id="confirm-dialog-description" className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-red-600/20 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
