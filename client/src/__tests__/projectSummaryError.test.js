import { describe, expect, it } from 'vitest'
import { projectSummaryError } from '../lib/projectSummaryError'

describe('project summary retry guidance', () => {
  const now = Date.parse('2026-09-10T10:00:00Z')
  it('uses the later GitHub retry deadline', () => {
    const result = projectSummaryError({ code: 'GITHUB_RATE_LIMITED', retryAfter: 60, resetAt: new Date(now + 120000).toISOString() }, now)
    expect(result.retryAt).toBe(now + 120000)
    expect(result.guidance).toContain(new Date(now + 120000).toLocaleString())
    expect(result.guidance).toContain('Suggested retry time')
  })
  it('suggests a short pause when rate-limit metadata is missing or malformed', () => {
    expect(projectSummaryError({ code: 'GITHUB_RATE_LIMITED', retryAfter: -5, resetAt: 'invalid' }, now).retryAt).toBe(now + 60000)
  })
  it.each([
    ['GITHUB_TIMEOUT', 504, '10 seconds', 'Reconnecting is not usually needed'],
    ['GITHUB_RECONNECT_REQUIRED', 409, 'needs attention', 'person who linked'],
    ['GITHUB_REQUEST_FAILED', 401, 'needs attention', 'profile'],
    ['GITHUB_REQUEST_FAILED', 403, 'repository', 'repository access'],
    ['GITHUB_REQUEST_FAILED', 404, 'repository', 'repository access'],
    ['GITHUB_CONTEXT_CHANGED', 409, 'changed', 'fresh summary'],
    ['GITHUB_UNAVAILABLE', 502, 'temporarily unavailable', 'Try again shortly'],
  ])('explains %s (%s) without a cooldown', (code, status, message, guidance) => {
    const result = projectSummaryError({ code, status }, now)
    expect(result.message).toContain(message)
    expect(result.guidance).toContain(guidance)
    expect(result.retryAt).toBe(0)
    expect(result.github).toBe(true)
  })
  it('does not mislabel OpenAI throttling as a GitHub problem', () => {
    expect(projectSummaryError({ code: 'AI_RATE_LIMIT', status: 429, message: 'AI rate limited' }, now)).toMatchObject({ message: 'AI rate limited', github: false, retryAt: 0 })
  })
})
