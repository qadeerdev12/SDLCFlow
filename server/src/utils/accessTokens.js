import jwt from 'jsonwebtoken';
import { sessionVersion } from './sessionTokens.js';

export const ACCESS_LIFETIME_SECONDS = 15 * 60;

/** Verify before using any claim in a query. Compatibility is explicit: any
 * new-format marker opts into ALL new checks, never a partial legacy fallback.
 * Remove the marker-free legacy path only at the coordinated client cutover.
 */
export function verifyAccessToken(token) {
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    if (!claims || typeof claims !== 'object' || typeof claims.id !== 'string'
        || !/^[a-f0-9]{24}$/i.test(claims.id) || sessionVersion(claims.sessionVersion) === null) {
        throw new jwt.JsonWebTokenError('Invalid session claims');
    }
    const familyToken = ['sid', 'purpose', 'iss', 'aud'].some((key) => Object.hasOwn(claims, key));
    const now = Math.floor(Date.now() / 1000);
    if (familyToken && (typeof claims.sid !== 'string' || !/^[a-f0-9]{24}$/.test(claims.sid)
        || claims.sessionVersion === undefined || claims.purpose !== 'access'
        || claims.iss !== 'sdlcflow' || claims.aud !== 'sdlcflow-api'
        || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
        || claims.iat < 0 || claims.iat > now || claims.exp <= claims.iat
        || claims.exp - claims.iat > ACCESS_LIFETIME_SECONDS)) {
        throw new jwt.JsonWebTokenError('Invalid access claims');
    }
    // Validate shape before reporting expiry: malformed tokens must not invite
    // refresh. Legacy fixtures may lack exp; every newly issued token requires it.
    if (claims.exp !== undefined) {
        if (!Number.isFinite(claims.exp)) throw new jwt.JsonWebTokenError('Invalid expiration');
        if (now >= claims.exp) throw new jwt.TokenExpiredError('Token expired', new Date(claims.exp * 1000));
    }
    return claims;
}

// Future access format. Keep the captured family version, never upgrade it from
// a new account read: logout-all may have raced the refresh database write.
export function createAccessToken(session) {
    if (typeof session.userId !== 'string' || typeof session.sessionId !== 'string'
        || !/^[a-f0-9]{24}$/.test(session.userId) || !/^[a-f0-9]{24}$/.test(session.sessionId)
        || !Number.isSafeInteger(session.sessionVersion) || session.sessionVersion < 0) {
        throw new Error('Invalid refresh-session claims');
    }
    const expiresAt = Math.min(Math.floor(Date.now() / 1000) + ACCESS_LIFETIME_SECONDS,
        Math.floor(session.expiresAt.getTime() / 1000));
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('Session expired');
    const token = jwt.sign({ id: session.userId, sid: session.sessionId,
        sessionVersion: session.sessionVersion, purpose: 'access', exp: expiresAt }, process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'sdlcflow', audience: 'sdlcflow-api' });
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}
