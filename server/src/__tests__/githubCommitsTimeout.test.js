import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGitHubCommits } from '../services/githubService.js';

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function waitForAbort(signal) {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

describe('GitHub commit request deadline', () => {
  it.each(['headers', 'body'])('aborts stalled %s after 10 seconds and returns a safe timeout error', async (stage) => {
    let signal;
    fetch.mockImplementation(async (_url, options) => {
      signal = options.signal;
      if (stage === 'headers') return waitForAbort(signal);
      return { ok: true, json: () => waitForAbort(signal) };
    });
    const result = fetchGitHubCommits('private-token', 'team', 'app');
    const assertion = expect(result).rejects.toMatchObject({
      code: 'GITHUB_TIMEOUT', statusCode: 504,
      message: 'GitHub took too long to respond. Try again shortly.',
    });
    await vi.advanceTimersByTimeAsync(9999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves successful results and clears the timer without aborting', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => [{ sha: 'abcdef123', commit: { message: 'Fix API' } }] });
    const commits = await fetchGitHubCommits('token', 'team', 'app', { limit: 5, sha: 'release' });
    expect(commits[0]).toMatchObject({ sha: 'abcdef123', shortSha: 'abcdef1', message: 'Fix API' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.github.com/repos/team/app/commits?per_page=5&sha=release');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  });
  it('preserves rate-limit details and cleans up the timer', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, headers: { get: (key) => key === 'retry-after' ? '120' : null }, json: async () => ({ message: 'Limited' }) });
    await expect(fetchGitHubCommits('token', 'team', 'app')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED', statusCode: 429, retryAfter: 120 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves immediate network failures instead of reporting a timeout', async () => {
    const error = new TypeError('Network unavailable');
    fetch.mockRejectedValue(error);
    await expect(fetchGitHubCommits('token', 'team', 'app')).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });
});
