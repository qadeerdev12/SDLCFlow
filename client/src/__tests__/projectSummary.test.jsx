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
afterEach(cleanup)
describe('project summary panel', () => {
  it('waits for explicit generation then displays scoped evidence links', async () => {
    show()
    expect(mocks.summarize).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }))
    await screen.findByText('Password reset is done.')
    expect(mocks.summarize).toHaveBeenCalledWith('board-1', 'token')
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
