import { createSessionToken } from '../utils/sessionTokens.js';
import { createAccessToken } from '../utils/accessTokens.js';
import { createRefreshSession } from './refreshSessionService.js';
import RefreshSession from '../models/RefreshSession.js';

/** Called only after signup or password verification. Router-owned locals select
 * the migration mode; request bodies/headers must never choose token policy.
 */
export async function issueAuthSession(user, res) {
    const security = res.locals.refreshSecurity;
    if (!security) return { token: createSessionToken(user) };

    const session = await createRefreshSession(user);
    try {
        const access = createAccessToken(session);
        security.setCookie(res, session.credential, session.expiresAt);
        return access;
    } catch (error) {
        // If signing/cookie preparation fails, discard the unissued family.
        // Never delete the account: signup may already have created it safely.
        await RefreshSession.deleteOne({ _id: session.sessionId });
        throw error;
    }
}
