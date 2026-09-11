// Match the client's conservative deadline: honor whichever provider wait is
// later, and round up so the HTTP header cannot enable an early retry.
export function summaryRetryAfter(error, now = Date.now()) {
  const seconds = Number(error.retryAfter);
  const after = Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : 0;
  const reset = typeof error.resetAt === 'string' ? Date.parse(error.resetAt) : 0;
  const deadline = Math.max(
    Number.isFinite(new Date(after).getTime()) ? after : 0,
    Number.isFinite(reset) ? reset : 0,
  );
  return deadline > now ? Math.ceil((deadline - now) / 1000) : 60;
}
