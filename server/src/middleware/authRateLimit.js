import { rateLimit } from 'express-rate-limit';

export const AUTH_LIMITS = {
  login: { limit: 20, windowMs: 15 * 60 * 1000 },
  register: { limit: 10, windowMs: 60 * 60 * 1000 },
};

export function createAuthRateLimit(action) {
  return rateLimit({
    ...AUTH_LIMITS[action],
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Default key generation uses req.ip and groups IPv6 addresses by /56.
    // Count successes too: cycling accounts must not reset the IP's budget.
    handler(req, res) {
      const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      res.set('Cache-Control', 'no-store');
      return res.status(429).json({
        error: {
          code: 'AUTH_RATE_LIMITED',
          message: `Too many ${action === 'login' ? 'sign-in' : 'signup'} attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
          retryAfter,
          resetAt: req.rateLimit.resetTime.toISOString(),
        },
      });
    },
  });
}
