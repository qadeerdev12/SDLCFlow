import { expect, it } from 'vitest';
import { summaryRetryAfter } from '../utils/summaryRetryAfter.js';

const now = Date.parse('2026-09-11T00:00:00Z');
it('honors the later absolute reset time and rounds up', () => {
  expect(summaryRetryAfter({ retryAfter: 60, resetAt: new Date(now + 120100).toISOString() }, now)).toBe(121);
});
it('honors the longer relative wait', () => {
  expect(summaryRetryAfter({ retryAfter: 180, resetAt: new Date(now + 60000).toISOString() }, now)).toBe(180);
});
it.each([{}, { retryAfter: -1 }, { retryAfter: 'invalid', resetAt: 'invalid' }, { retryAfter: Infinity }, { retryAfter: 1e300 }, { resetAt: new Date(now - 1000).toISOString() }])('uses a finite fallback for unusable metadata: %j', (value) => {
  expect(summaryRetryAfter(value, now)).toBe(60);
});
