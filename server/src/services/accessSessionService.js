import RefreshSession from '../models/RefreshSession.js';

/** Claims must already be signature/shape verified. Read current family state
 * per operation; caching it would delay logout/replay revocation. Account-wide
 * version checks remain mandatory in the caller, including for legacy tokens.
 */
export async function getAccessSessionFamily({ sessionId, userId, version }) {
    return RefreshSession.findOne({ _id: sessionId, user: userId,
        sessionVersion: version, revokedAt: null, expiresAt: { $gt: new Date() },
    }).select('_id expiresAt').lean();
}
