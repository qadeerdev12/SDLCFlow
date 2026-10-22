import { verifyAccessToken } from '../utils/accessTokens.js';
import { getAccessSessionFamily } from '../services/accessSessionService.js';
import User from '../models/User.js';
import { sessionVersion } from '../utils/sessionTokens.js';

/**
 * Authenticate REST requests: verify the JWT, load the account, then compare
 * session versions and (for new tokens) family validity. Sets req.user only
 * after all checks pass. Project/role
 * authorization remains the responsibility of downstream guards.
 * Socket.IO has a separate authentication path; this guard does not protect it.
 */
export async function protect(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: {code: 'NO_TOKEN_PROVIDED', message: 'Not Authorised - no token provided'},
            });
        }

        const token = authHeader.split(' ')[1];

        // A valid signature alone is insufficient: validate claims before using
        // the ID in a database query, including tokens signed by older code.
        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            return res.status(401).json({
                error: {code: err.name === 'TokenExpiredError' ? 'SESSION_EXPIRED' : 'INVALID_TOKEN', message: 'Not Authorised - invalid or expired token'},
            });
        }

        // sessionVersion is hidden by default, so explicitly load it here.
        // Never cache this account lookup across requests: revocation needs fresh state.
        const user = await User.findById(decoded.id).select('+sessionVersion');
        if (!user) {
            return res.status(401).json({
                error: {code: 'USER_NOT_FOUND', message: 'Not Authorised - user not found'},
            });
        }

        // Check the current database version on every request, not just at login.
        // Future revocation increments this value; older signed tokens then fail.
        const currentVersion = sessionVersion(user.sessionVersion);
        if (currentVersion === null || sessionVersion(decoded.sessionVersion) !== currentVersion) {
            return res.status(401).json({
                error: { code: 'SESSION_INVALIDATED', message: 'Your session is no longer valid. Please sign in again.' },
            });
        }

        if (decoded.sid) {
            const family = await getAccessSessionFamily({ sessionId: decoded.sid,
                userId: decoded.id, version: decoded.sessionVersion });
            if (!family || family.expiresAt.getTime() <= Date.now()) {
                return res.status(401).json({ error: { code: 'SESSION_INVALIDATED', message: 'Your session is no longer valid. Please sign in again.' } });
            }
        }

        // Database work may cross the expiry boundary; do not dispatch a request
        // whose token expired while authorization was waiting for storage.
        if (decoded.exp !== undefined && Date.now() >= decoded.exp * 1000) {
            return res.status(401).json({ error: { code: 'SESSION_EXPIRED', message: 'Your session has expired.' } });
        }

        // Controllers must serialize explicit public fields, not this full document.
        req.user = user;
        // Internal verified claims for flows that must remain tied to this
        // login family (for example, an OAuth callback arriving without a JWT).
        req.authSession = { sessionId: decoded.sid, sessionVersion: decoded.sessionVersion };

        next();     
    } catch (error) {
        console.error('Session authorization temporarily unavailable');
        res.status(503).json({
            error: {code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.'},
        });
    }
}
