import { afterEach, expect, it, vi } from 'vitest';
import { fetchGitHubCommits } from '../services/githubService.js';

afterEach(() => vi.unstubAllGlobals());
function respond(status, headers, message = 'GitHub request failed.') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status,
    headers: { get: (key) => headers[key] ?? null }, json: async () => ({ message }),
  }));
}
it.each(['invalid', '-10', 'Infinity', '1e300', ''])('keeps malformed timing (%s) a rate-limit error', async (value) => {
  respond(429, { 'retry-after': value, 'x-ratelimit-reset': value });
  await expect(fetchGitHubCommits('test', 'team', 'app')).rejects.toMatchObject({
    code: 'GITHUB_RATE_LIMITED', statusCode: 429, retryAfter: null, resetAt: null,
  });
});
it('recognizes secondary throttling even with primary quota remaining', async () => {
  respond(403, { 'x-ratelimit-remaining': '3000', 'retry-after': '90' });
  await expect(fetchGitHubCommits('test', 'team', 'app')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED', retryAfter: 90 });
});
it('recognizes explicit secondary limits without timing metadata', async () => {
  respond(403, {}, 'You have exceeded a secondary rate limit.');
  await expect(fetchGitHubCommits('test', 'team', 'app')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED', retryAfter: null });
});
it('does not disguise permission errors as rate limits', async () => {
  respond(403, { 'x-ratelimit-remaining': '3000' }, 'Resource not accessible by integration');
  await expect(fetchGitHubCommits('test', 'team', 'app')).rejects.toMatchObject({ code: 'GITHUB_REQUEST_FAILED', statusCode: 403 });
});
