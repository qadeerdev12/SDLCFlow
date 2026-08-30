import { useCallback, useMemo, useState } from 'react'
import { ToastContext } from './toastContextValue'

const TOAST_STYLES = {
  success: {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
    className: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100',
  },
  error: {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
    className: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
  },
  info: {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
    className: 'border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(({ title, message, type = 'info', duration = 4500 }) => {
    const id = crypto.randomUUID()
    setToasts((current) => [{ id, title, message, type }, ...current].slice(0, 4))

    if (duration > 0) {
      window.setTimeout(() => dismissToast(id), duration)
    }

    return id
  }, [dismissToast])

  const value = useMemo(() => ({
    showToast,
    dismissToast,
    success: (title, message) => showToast({ title, message, type: 'success' }),
    error: (title, message) => showToast({ title, message, type: 'error', duration: 6500 }),
    info: (title, message) => showToast({ title, message, type: 'info' }),
  }), [dismissToast, showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[calc(100vw-2rem)] sm:max-w-sm">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info
        return (
          <article
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-xl shadow-zinc-900/10 backdrop-blur animate-in slide-in-from-top-2 fade-in dark:shadow-black/30 ${style.className}`}
          >
            <span className="mt-0.5 shrink-0">{style.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="mt-0.5 text-sm opacity-80">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </article>
        )
      })}
    </div>
  )
}
