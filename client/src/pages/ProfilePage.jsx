import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { authApi, integrationApi } from '../lib/api'

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function initials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

export default function ProfilePage() {
  const { user, token, logout, updateUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [githubAccount, setGithubAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [githubLoading, setGithubLoading] = useState(true)
  const [githubBusy, setGithubBusy] = useState(false)
  const [githubError, setGithubError] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAccount() {
      try {
        setLoading(true)
        setGithubLoading(true)
        setError('')
        setGithubError('')
        const [profileRes, githubRes] = await Promise.all([
          authApi.getProfile(token),
          integrationApi.getGitHubAccount(token),
        ])
        if (!cancelled) {
          setProfile(profileRes.data)
          setGithubAccount(githubRes.data.account)
          setName(profileRes.data.user.name || '')
          setEmail(profileRes.data.user.email || '')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setGithubLoading(false)
        }
      }
    }

    loadAccount()
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    const githubStatus = searchParams.get('github')
    if (!githubStatus) return

    if (githubStatus === 'connected') {
      toast.success('GitHub connected', 'Your GitHub account is now linked to SDLCFlow.')
    } else if (githubStatus === 'missing_code') {
      toast.error('GitHub connection cancelled', 'GitHub did not return an authorization code.')
    } else {
      toast.error('GitHub connection failed', 'Please try connecting GitHub again.')
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('github')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams, toast])

  const account = profile?.user || user || {}
  const stats = profile?.stats || {}
  const canDelete = password && confirmText === account.email && !deleting
  const profileChanged = name.trim() !== (account.name || '') || email.trim().toLowerCase() !== (account.email || '')
  const canSaveProfile = name.trim() && email.trim() && profileChanged && !savingProfile
  const canSavePassword = currentPassword && newPassword && confirmPassword && newPassword === confirmPassword && !savingPassword

  const statCards = [
    { label: 'Projects', value: stats.boards ?? '-' },
    { label: 'Owned projects', value: stats.ownedBoards ?? '-' },
    { label: 'Shared projects', value: stats.sharedBoards ?? '-' },
    { label: 'Assigned cards', value: stats.assignedCards ?? '-' },
    { label: 'Comments', value: stats.comments ?? '-' },
  ]

  async function handleDeleteAccount(e) {
    e.preventDefault()
    if (!canDelete) return
    setDeleteConfirmOpen(true)
  }

  async function confirmDeleteAccount() {
    if (!canDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await authApi.deleteAccount(password, token)
      toast.success('Account deleted')
      logout()
      navigate('/register')
    } catch (err) {
      setDeleteError(err.message)
      toast.error('Could not delete account', err.message)
      setDeleting(false)
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!canSaveProfile) return

    setSavingProfile(true)
    setProfileMessage('')
    setProfileError('')
    try {
      const res = await authApi.updateProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
      }, token)
      const nextUser = res.data.user
      setProfile((current) => current ? { ...current, user: nextUser } : { user: nextUser, stats })
      updateUser(nextUser)
      setProfileMessage('Profile updated.')
      toast.success('Profile updated', 'Your account details were saved.')
    } catch (err) {
      setProfileError(err.message)
      toast.error('Could not update profile', err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSavePassword(e) {
    e.preventDefault()
    if (!canSavePassword) return

    setSavingPassword(true)
    setPasswordMessage('')
    setPasswordError('')
    try {
      await authApi.updatePassword(currentPassword, newPassword, token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage('Password updated.')
      toast.success('Password updated', 'Use your new password the next time you sign in.')
    } catch (err) {
      setPasswordError(err.message)
      toast.error('Could not update password', err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleConnectGitHub() {
    setGithubBusy(true)
    setGithubError('')
    try {
      const res = await integrationApi.startGitHubOAuth(token)
      window.location.href = res.data.authorizationUrl
    } catch (err) {
      setGithubError(err.message)
      toast.error('Could not start GitHub connection', err.message)
      setGithubBusy(false)
    }
  }

  async function handleDisconnectGitHub() {
    setGithubBusy(true)
    setGithubError('')
    try {
      await integrationApi.disconnectGitHubAccount(token)
      setGithubAccount(null)
      toast.success('GitHub disconnected', 'Your GitHub account was removed from SDLCFlow.')
    } catch (err) {
      setGithubError(err.message)
      toast.error('Could not disconnect GitHub', err.message)
    } finally {
      setGithubBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Account</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Review your account details, workspace footprint, and account deletion options.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-teal-700 text-2xl font-bold text-white">
                {initials(account.name)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-zinc-950 dark:text-zinc-100">
                  {loading ? 'Loading profile...' : account.name}
                </h2>
                <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">{account.email}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Joined" value={formatDate(account.createdAt)} />
                  <Info label="Last updated" value={formatDate(account.updatedAt)} />
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {statCards.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-2xl font-semibold text-zinc-950 dark:text-white">{loading ? '-' : stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white shadow-sm dark:border-zinc-800">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Workspace footprint</p>
            <h2 className="mt-4 text-lg font-semibold">Your project context in one place.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              These stats help you see how much of SDLCFlow is yours, shared, or actively assigned to you.
            </p>
          </aside>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <GitHubConnectionCard
            account={githubAccount}
            loading={githubLoading}
            busy={githubBusy}
            error={githubError}
            onConnect={handleConnectGitHub}
            onDisconnect={handleDisconnectGitHub}
          />

          <form onSubmit={handleSaveProfile} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Details</p>
              <h2 className="mt-2 text-lg font-semibold">Account information</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Update the name and email shown across your projects, comments, and activity.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Name</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setProfileMessage('')
                    setProfileError('')
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setProfileMessage('')
                    setProfileError('')
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={`min-h-5 text-sm ${profileError ? 'text-red-600 dark:text-red-300' : 'text-teal-700 dark:text-teal-300'}`}>
                {profileError || profileMessage}
              </p>
              <button
                type="submit"
                disabled={!canSaveProfile}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {savingProfile ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </form>

          <form onSubmit={handleSavePassword} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Security</p>
              <h2 className="mt-2 text-lg font-semibold">Change password</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                Enter your current password before choosing a new one.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Current password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value)
                    setPasswordMessage('')
                    setPasswordError('')
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setPasswordMessage('')
                      setPasswordError('')
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      setPasswordMessage('')
                      setPasswordError('')
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className={`min-h-5 text-sm ${passwordError ? 'text-red-600 dark:text-red-300' : 'text-teal-700 dark:text-teal-300'}`}>
                {passwordError || (newPassword && confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match.' : passwordMessage)}
              </p>
              <button
                type="submit"
                disabled={!canSavePassword}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
              >
                {savingPassword ? 'Saving...' : 'Update password'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-4 rounded-lg border border-red-200 bg-white p-5 shadow-sm dark:border-red-500/30 dark:bg-zinc-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-600 dark:text-red-300">Danger zone</p>
              <h2 className="mt-2 text-lg font-semibold">Delete account</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                This removes your account, owned projects, comments, activity records, and assignments. Shared projects you do not own will remain for other members.
              </p>
            </div>
          </div>

          <form onSubmit={handleDeleteAccount} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Confirm email</span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={account.email || 'you@example.com'}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-950 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>

            <button
              type="submit"
              disabled={!canDelete}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </form>

          {deleteError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
              {deleteError}
            </p>
          )}
        </section>
      </main>

      {deleteConfirmOpen && (
        <ConfirmDialog
          title="Delete your account?"
          description="This permanently removes your account, owned projects, comments, activity records, and assignments. Shared projects you do not own will remain for other members."
          confirmLabel="Delete account"
          pending={deleting}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={confirmDeleteAccount}
        />
      )}
    </div>
  )
}

function GitHubConnectionCard({ account, loading, busy, error, onConnect, onDisconnect }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Integrations</p>
          <h2 className="mt-2 text-lg font-semibold">GitHub connection</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Connect your GitHub account so SDLCFlow can bring development context into your projects.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${account ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
          {account ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {loading ? (
          <div className="animate-pulse">
            <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-3 h-4 w-36 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-2 h-3 w-52 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ) : account ? (
          <div className="flex items-center gap-3">
            {account.avatarUrl ? (
              <img
                src={account.avatarUrl}
                alt=""
                className="h-12 w-12 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
              />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-zinc-950 text-sm font-bold text-white dark:bg-white dark:text-zinc-950">
                {initials(account.displayName || account.username)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                {account.displayName || account.username}
              </p>
              <a
                href={account.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate text-sm text-teal-700 hover:text-teal-600 dark:text-teal-300 dark:hover:text-teal-200"
              >
                @{account.username}
              </a>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Connected {formatDate(account.connectedAt)}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">No GitHub account connected yet.</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              This first connection only reads your GitHub profile and email. Repository access comes next when we add project repo linking.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          Current scopes: <span className="font-semibold">read:user</span>, <span className="font-semibold">user:email</span>
        </p>
        {account ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={busy}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:w-auto"
          >
            {busy ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy || loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
          >
            {busy ? 'Opening GitHub...' : 'Connect GitHub'}
          </button>
        )}
      </div>
    </section>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  )
}
