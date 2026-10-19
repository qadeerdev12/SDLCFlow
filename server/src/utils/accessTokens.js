import jwt from 'jsonwebtoken';

export const ACCESS_LIFETIME_SECONDS = 15 * 60;

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
