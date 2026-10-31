import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import PasswordResetToken from '../models/PasswordResetToken.js';
import User from '../models/User.js';

export const PASSWORD_RESET_LIFETIME_MS = 15 * 60 * 1000;
const digest = (token) => createHash('sha256').update(token).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

/** Internal issuance only. Never return this secret in an HTTP response or log;
 * the future request handler must deliver it through the account's stored email.
 * No session is revoked and no password is changed by requesting a reset.
 */
export async function issuePasswordResetToken(userId) {
    if (!mongoose.isObjectIdOrHexString(userId)) return null;
    const user = await User.findById(userId).select('_id +sessionVersion').lean();
    if (!user) return null;
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_LIFETIME_MS);
    await PasswordResetToken.findOneAndUpdate({ user: user._id }, {
        tokenDigest: digest(token), sessionVersion: user.sessionVersion ?? 0, expiresAt,
    }, { upsert: true, runValidators: true });
    return { token, expiresAt };
}

/** Internal one-time claim, NOT a completed password reset or a login grant.
 * The eventual password writer MUST compare-and-swap the returned sessionVersion
 * and increment it with the password update. A revocation can race this check.
 * Validate the new password before claiming; failures after claiming require a
 * fresh reset request. Never consume on GET (mail scanners may open links).
 */
export async function consumePasswordResetToken(token) {
    if (!validToken(token)) return null;
    // Atomic deletion allows at most one concurrent claimant. A wrong token
    // cannot delete the genuine pending reset. Only digests enter queries.
    const attempt = await PasswordResetToken.findOneAndDelete({
        tokenDigest: digest(token), expiresAt: { $gt: new Date() },
    }).lean();
    if (!attempt) return null;
    const user = await User.findById(attempt.user).select('_id +sessionVersion').lean();
    if (!user || (user.sessionVersion ?? 0) !== attempt.sessionVersion) return null;
    return { userId: user._id, sessionVersion: attempt.sessionVersion };
}
