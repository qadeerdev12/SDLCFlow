import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../context/useToast'
import ConfirmDialog from './ConfirmDialog'

const ROLES = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
]

function memberUserId(member) {
  return member.user?.id || member.user?._id || member.user
}

function initials(name, email) {
  const source = name || email || '?'
  return source
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function MembersPanel({
  board,
  members,
  presence,
  currentUserId,
  currentRole,
  onClose,
  onAddMember,
  onChangeRole,
  onRemoveMember,
}) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removingId, setRemovingId] = useState(null)

  useEffect(() => {
    function onKeyDown(e) {
      // A nested confirmation dialog owns Escape while it is open.
      if (e.key === 'Escape' && !removeTarget) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, removeTarget])

  const onlineIds = useMemo(
    () => new Set(presence.map((entry) => entry.user?.id).filter(Boolean)),
    [presence]
  )
  const canAddMembers = ['owner', 'admin'].includes(currentRole)
  const canChangeRoles = currentRole === 'owner'
  const canRemoveMembers = ['owner', 'admin'].includes(currentRole)

  async function handleAdd(e) {
    e.preventDefault()
    if (!email.trim() || submitting) return

    setSubmitting(true)
    setError('')
    try {
      await onAddMember(email.trim(), role)
      setEmail('')
      setRole('member')
    } catch (err) {
      setError(err.message)
      toast.error('Could not add member', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(member) {
    // Defer the destructive call until the user confirms in the app dialog.
    setRemoveTarget(member)
  }

  async function confirmRemoveMember() {
    if (!removeTarget) return
    const userId = memberUserId(removeTarget)
    setRemovingId(userId)
    try {
      await onRemoveMember(userId)
      setRemoveTarget(null)
    } catch (err) {
      setError(err.message)
      toast.error('Could not remove member', err.message)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-zinc-950/45 p-0 backdrop-blur-sm dark:bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Project members"
        className="flex max-h-dvh w-full max-w-2xl flex-col overflow-hidden border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Members</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-zinc-950 dark:text-zinc-100">{board.name}</h2>
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

        {canAddMembers && (
          <form onSubmit={handleAdd} className="grid gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800 sm:grid-cols-[1fr_140px_auto]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="min-w-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={currentRole !== 'owner'}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-500 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add'}
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</p>
          )}

          {members.map((member) => {
            const userId = memberUserId(member)
            const isCurrentUser = String(userId) === String(currentUserId)
            const isOnline = onlineIds.has(String(userId))
            const canEditThisRole = canChangeRoles && member.role !== 'owner' && !isCurrentUser
            const canRemoveThisMember = canRemoveMembers && !isCurrentUser && (currentRole === 'owner' || member.role !== 'owner')

            return (
              <div key={userId} className="flex flex-col gap-3 rounded-lg px-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-zinc-950 text-xs font-bold text-white dark:bg-white dark:text-zinc-950">
                    {initials(member.user?.name, member.user?.email)}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900 ${isOnline ? 'bg-teal-500' : 'bg-zinc-400'}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                      {member.user?.name || member.user?.email}
                      {isCurrentUser && <span className="ml-2 text-xs font-medium text-zinc-400">You</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{member.user?.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canEditThisRole ? (
                    <select
                      value={member.role}
                      onChange={(e) => onChangeRole(userId, e.target.value).catch((err) => {
                        setError(err.message)
                        toast.error('Could not update role', err.message)
                      })}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-950 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      {ROLES.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-semibold capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {member.role}
                    </span>
                  )}

                  {canRemoveThisMember && (
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      disabled={removingId === userId}
                      aria-label={`Remove ${member.user?.name || member.user?.email}`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {removeTarget && (
        <ConfirmDialog
          title={`Remove ${removeTarget.user?.name || removeTarget.user?.email || 'this member'}?`}
          description={`They will lose access to "${board.name}" and will no longer see this project in their dashboard.`}
          confirmLabel="Remove member"
          pending={removingId === memberUserId(removeTarget)}
          onCancel={() => setRemoveTarget(null)}
          onConfirm={confirmRemoveMember}
        />
      )}
    </div>
  )
}
