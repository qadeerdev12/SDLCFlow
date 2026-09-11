import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectSummaryPanel from '../components/board/ProjectSummaryPanel'

const mocks = vi.hoisted(() => ({ summarize: vi.fn() }))
vi.mock('../lib/api', () => ({ boardApi: { summarize: mocks.summarize } }))
const summary = {
  sections: { completed: [{ text: 'Password reset is done.', cards: [{ id: 'card-1', title: 'Password reset' }] }], inProgress: [], blocked: [] },
  scope: { completed: { included: 20, truncated: true }, inProgress: { included: 0, truncated: false }, blocked: { included: 0, truncated: false } },
  sampledAt: '2026-09-10T10:00:00Z', empty: false,
}
const props = { board: { _id: 'board-1', name: 'Uptime Desk' }, token: 'token', onClose: vi.fn() }
function show() { return render(<MemoryRouter><ProjectSummaryPanel {...props} /></MemoryRouter>) }
beforeEach(() => { vi.resetAllMocks(); mocks.summarize.mockResolvedValue({ data: { summary } }) })
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('project summary panel', () => {
  it('contains programmatic focus, locks background scrolling, and restores both on close', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'scroll'
    try {
      const view = show()
      expect(document.body.style.overflow).toBe('hidden')
      trigger.focus()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close summary' }))
      view.unmount()
      expect(document.body.style.overflow).toBe('scroll')
      expect(document.activeElement).toBe(trigger)
    } finally {
      trigger.remove()
      document.body.style.overflow = oldOverflow
    }
  })
  it('waits for explicit generation then displays scoped evidence links', async () => {
    show()
    expect(mocks.summarize).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    expect(mocks.summarize).toHaveBeenCalledWith('board-1', 'token', { includeGitHub: false })
    expect(screen.getByRole('link', { name: 'Password reset' }).getAttribute('href')).toBe('/boards/board-1?card=card-1')
    expect(screen.getByText('20 tasks included; more tasks omitted')).toBeTruthy()
  })
  it('handles errors with manual retry and retains a prior snapshot on transient failure', async () => {
    mocks.summarize.mockResolvedValueOnce({ data: { summary } }).mockRejectedValueOnce(new Error('Provider unavailable'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate summary' }))
    await screen.findByRole('alert')
    expect(screen.getByText('Password reset is done.')).toBeTruthy()
    expect(mocks.summarize).toHaveBeenCalledTimes(2)
  })
  it('drops a prior snapshot when access is revoked', async () => {
    mocks.summarize.mockResolvedValueOnce({ data: { summary } }).mockRejectedValueOnce(Object.assign(new Error('Project not found'), { status: 404 }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate summary' }))
    await screen.findByRole('alert')
    expect(screen.queryByText('Password reset is done.')).toBeNull()
  })
  it('prevents duplicate generation and ignores results after closing', async () => {
    let finish
    mocks.summarize.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const view = show()
    const button = screen.getByRole('button', { name: 'Generate summary' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.summarize).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => finish({ data: { summary } }))
    expect(screen.queryByText('Password reset is done.')).toBeNull()
  })
  it('supports Escape and contains keyboard focus', () => {
    show()
    const close = screen.getByRole('button', { name: 'Close summary' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate summary' }))
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})

const github = {
  status: 'ready', repository: { fullName: 'team/app', htmlUrl: 'https://github.com/team/app' },
  included: 1, limit: 10, sampledAt: '2026-09-10T10:00:00Z',
  bullets: [{ text: 'Commit reports an API fix.', commits: [{ sha: 'abcdef123456', title: 'Fix API', htmlUrl: 'https://github.com/team/app/commit/abcdef123456' }] }],
}
describe('GitHub summary opt-in', () => {
  it('preserves the GitHub deadline when switching sources and generating task-only content', async () => {
    vi.useFakeTimers()
    mocks.summarize.mockRejectedValueOnce(Object.assign(new Error('Limited'), { code: 'GITHUB_RATE_LIMITED', retryAfter: 120, status: 429 }))
      .mockResolvedValue({ data: { summary } })
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate summary' })))
    fireEvent.click(screen.getByRole('button', { name: 'Use tasks only' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate summary' })))
    expect(mocks.summarize).toHaveBeenLastCalledWith('board-1', 'token', { includeGitHub: false })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('GitHub retry available after')
    await act(() => vi.advanceTimersByTimeAsync(120000))
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(false)
    expect(mocks.summarize).toHaveBeenCalledTimes(2)
  })
  it('waits for a rate-limit deadline without automatically retrying', async () => {
    vi.useFakeTimers()
    mocks.summarize.mockRejectedValue(Object.assign(new Error('Limited'), { code: 'GITHUB_RATE_LIMITED', retryAfter: 2, status: 429 }))
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate summary' })))
    expect(screen.getByRole('alert').textContent).toContain('Suggested retry time')
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(false)
    expect(mocks.summarize).toHaveBeenCalledTimes(1)
  })
  it('allows task-only fallback during a GitHub cooldown without making another request', async () => {
    vi.useFakeTimers()
    mocks.summarize.mockRejectedValue(Object.assign(new Error('Limited'), { code: 'GITHUB_RATE_LIMITED', retryAfter: 120, status: 429 }))
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Generate summary' })))
    fireEvent.click(screen.getByRole('button', { name: 'Use tasks only' }))
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(false)
    expect(screen.getByRole('checkbox').checked).toBe(false)
    expect(mocks.summarize).toHaveBeenCalledTimes(1)
  })
  it('shows timeout-specific guidance with an immediately available manual retry', async () => {
    mocks.summarize.mockRejectedValue(Object.assign(new Error('Timeout'), { code: 'GITHUB_TIMEOUT', status: 504 }))
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    expect((await screen.findByRole('alert')).textContent).toContain('GitHub did not respond within 10 seconds')
    expect(screen.getByRole('button', { name: 'Generate summary' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Use tasks only' })).toBeTruthy()
    expect(mocks.summarize).toHaveBeenCalledTimes(1)
  })
  it('starts unchecked and discloses the transfer without making a request', () => {
    show()
    expect(screen.getByRole('checkbox').checked).toBe(false)
    expect(screen.getByText(/Commit bodies, author details, and source code are excluded/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(mocks.summarize).not.toHaveBeenCalled()
  })
  it('sends explicit consent and displays commit evidence with safe external links', async () => {
    mocks.summarize.mockResolvedValue({ data: { summary: { ...summary, github } } })
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Commit reports an API fix.')
    expect(mocks.summarize).toHaveBeenCalledWith('board-1', 'token', { includeGitHub: true })
    expect(screen.getByText(/1 commit included; up to 10/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'abcdef1 Fix API' })
    expect(link.getAttribute('href')).toBe(github.bullets[0].commits[0].htmlUrl)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: 'team/app' })).toBeTruthy()
  })
  it('clears an old snapshot when selection changes and does not automatically regenerate', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByText('Password reset is done.')).toBeNull()
    expect(mocks.summarize).toHaveBeenCalledTimes(1)
  })
  it.each(['not_linked', 'ready'])('shows the appropriate empty GitHub state: %s', async (status) => {
    mocks.summarize.mockResolvedValue({ data: { summary: { ...summary, github: { ...github, status, included: 0, bullets: [] } } } })
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText(status === 'not_linked' ? /No repository is linked/ : 'No commits in this sample.')
    expect(screen.getByText('Password reset is done.')).toBeTruthy()
  })
  it('locks the selection during generation and resets consent on reopening', async () => {
    let finish
    mocks.summarize.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const view = show()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    expect(screen.getByRole('checkbox').disabled).toBe(true)
    view.unmount()
    show()
    expect(screen.getByRole('checkbox').checked).toBe(false)
    await act(async () => finish({ data: { summary: { ...summary, github } } }))
    expect(screen.queryByText('Commit reports an API fix.')).toBeNull()
  })
  it.each(['GITHUB_RECONNECT_REQUIRED', 'GITHUB_CONTEXT_CHANGED'])('clears private GitHub snapshots on %s and offers a manual task-only retry', async (code) => {
    mocks.summarize.mockResolvedValueOnce({ data: { summary: { ...summary, github } } })
      .mockRejectedValueOnce(Object.assign(new Error('Connection changed'), { code, status: 409 }))
    show()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Commit reports an API fix.')
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate summary' }))
    await screen.findByRole('alert')
    expect(screen.queryByText('Commit reports an API fix.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use tasks only' }))
    expect(screen.getByRole('checkbox').checked).toBe(false)
    expect(mocks.summarize).toHaveBeenCalledTimes(2)
    mocks.summarize.mockResolvedValue({ data: { summary } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    expect(mocks.summarize).toHaveBeenLastCalledWith('board-1', 'token', { includeGitHub: false })
  })
  it('keeps checkbox focus inside the dialog when it is the last enabled control', async () => {
    mocks.summarize.mockRejectedValue(new Error('Unavailable'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByRole('alert')
    const generate = screen.getByRole('button', { name: 'Generate summary' })
    generate.disabled = true
    const checkbox = screen.getByRole('checkbox')
    checkbox.focus()
    fireEvent.keyDown(checkbox, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close summary' }))
  })
})
