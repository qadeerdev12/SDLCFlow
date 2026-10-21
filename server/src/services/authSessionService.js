import { createAccessToken } from '../utils/accessTokens.js';
import { createRefreshSession } from './refreshSessionService.js';
import RefreshSession from '../models/RefreshSession.js';

/** Called only after signup or password verification. A cookie-enabled router
 * is required; missing wiring must never issue a legacy bearer credential.
 */
export async function issueAuthSession(user, res) {
    const security = res.locals.refreshSecurity;
    if (!security) throw new Error('Refresh cookie security must be configured before session issuance');

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
