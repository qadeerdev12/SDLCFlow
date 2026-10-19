import jwt from 'jsonwebtoken';

/**
 * Normalize a verified token claim or stored version for comparison.
 * @param {unknown} value
 * @returns {number|null} Zero for legacy absence; null for invalid state.
 * This does not verify JWT signatures. Callers must verify tokens first.
 */
export function sessionVersion(value) {
    // Only a missing field is legacy version zero. Malformed values must fail
    // closed rather than silently becoming a valid session version.
    if (value === undefined) return 0;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Issue a session only after registration or successful credential verification.
 * Pass a newly created User or a hydrated query result selecting +sessionVersion.
 * Do not accept the version from request data or default an omitted projection.
 * @param {{_id: unknown, sessionVersion: number}} user
 * @returns {string} Signed bearer token with the current account version.
 */
export function createSessionToken(user) {
    // Mongoose supplies zero for legacy documents when this field is selected.
    // An absent value here instead indicates a caller omitted the projection.
    if (user.sessionVersion === undefined) throw new Error('Session version must be selected before issuing a token');
    const version = sessionVersion(user.sessionVersion);
    if (version === null) throw new Error('Invalid stored session version');
    return jwt.sign({ id: user._id, sessionVersion: version }, process.env.JWT_SECRET, {
        expiresIn: '7d',
    });
}
