import express from 'express';
import { parse } from 'cookie';
import { rateLimit } from 'express-rate-limit';
import { createRefreshSecurity } from '../middleware/refreshSecurity.js';
import { rotateRefreshSession, revokeRefreshSession } from '../services/refreshSessionService.js';
import { createAccessToken } from '../utils/accessTokens.js';
import { revokeSocketFamily } from '../services/socketSessionService.js';

export const REFRESH_REQUEST_LIMIT = 60;

// Intentionally not mounted by createApp. Do not enable before
// login/account integration and the coordinated client migration are implemented.
export default function createRefreshRoutes(options) {
    const security = createRefreshSecurity(options);
    const router = express.Router();
    const limiter = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: REFRESH_REQUEST_LIMIT,
        standardHeaders: 'draft-8', legacyHeaders: false,
        handler(req, res) {
            const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
            res.set('Retry-After', String(retryAfter));
            res.status(429).json({ error: { code: 'AUTH_RATE_LIMITED', message: 'Too many session requests. Try again later.', retryAfter } });
        },
    });
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    // Independent per-IP budgets leave logout usable after refresh exhaustion.
    router.post('/refresh', limiter(), security.guard, express.json({ limit: '1kb' }), async (req, res, next) => {
        try {
            const session = await rotateRefreshSession(parse(req.headers.cookie || '')[security.cookieName]);
            const access = createAccessToken(session);
            security.setCookie(res, session.credential, session.expiresAt);
            res.json({ data: access });
        } catch (error) { next(error); }
    });
    router.post('/logout', limiter(), security.guard, express.json({ limit: '1kb' }), async (req, res, next) => {
        try {
            const session = await revokeRefreshSession(parse(req.headers.cookie || '')[security.cookieName]);
            revokeSocketFamily(req.app.get('io'), session.sessionId);
            security.clearCookie(res);
            res.json({ data: { loggedOut: true } });
        } catch (error) { next(error); }
    });
    router.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (['REFRESH_INVALID', 'REFRESH_REUSED', 'REFRESH_EXHAUSTED'].includes(error.code)) {
            // Only digest-matched, persisted revocations include this internal ID.
            if (error.sessionId) revokeSocketFamily(req.app.get('io'), error.sessionId);
            // Do not clear cookies on delayed failures: they could overwrite a
            // newer login's cookie. The client will handle terminal auth state.
            return res.status(401).json({ error: { code: error.code, message: 'Please sign in again.' } });
        }
        if (['entity.parse.failed', 'entity.too.large'].includes(error.type)) {
            return res.status(error.type === 'entity.too.large' ? 413 : 400)
                .json({ error: { code: 'VALIDATION', message: 'A small JSON body is required.' } });
        }
        // Never log raw database/parser errors, cookies, or token response data.
        return res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Session service is temporarily unavailable.' } });
    });
    return router;
}
