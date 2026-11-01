import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import EmailVerificationToken from '../models/EmailVerificationToken.js';
import { sessionVersion } from '../utils/sessionTokens.js';

export const EMAIL_VERIFICATION_LIFETIME_MS = 60 * 60 * 1000;
const digest = (token) => createHash('sha256').update(token).digest('hex');
const versionFilter = (field, version) => version === 0
    ? { $or: [{ [field]: 0 }, { [field]: { $exists: false } }] }
    : { [field]: version };

/** Internal only: deliver the returned secret to the returned stored email,
 * never a client-provided recipient. No HTTP endpoint or automatic mail yet.
 * Each successful persistence replaces the account's previous pending link.
 */
export async function issueEmailVerificationToken(userId) {
    if (!mongoose.isObjectIdOrHexString(userId)) return null;
    const user = await User.findById(userId)
        .select('email +emailVerifiedAt +emailVerificationVersion +sessionVersion').lean();
    if (!user || user.emailVerifiedAt != null) return null;
    const emailVersion = sessionVersion(user.emailVerificationVersion);
    const accountVersion = sessionVersion(user.sessionVersion);
    if (emailVersion === null || accountVersion === null) throw new Error('Invalid verification generation');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_LIFETIME_MS);
    await EmailVerificationToken.findOneAndUpdate({ user: user._id }, {
        tokenDigest: digest(token), email: user.email, emailVerificationVersion: emailVersion,
        sessionVersion: accountVersion, expiresAt,
    }, { upsert: true, runValidators: true });
    return { token, email: user.email, expiresAt };
}

/** Claim once, then conditionally verify the exact account/address snapshot.
 * Call only from explicit POST completion in the future, never GET (mail scans).
 * Failures after claiming burn the link; a fresh request is required. This does
 * not authenticate the caller, change a password, or mint/renew any session.
 */
export async function completeEmailVerification(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const attempt = await EmailVerificationToken.findOneAndDelete({
        tokenDigest: digest(token), expiresAt: { $gt: new Date() },
    }).lean();
    if (!attempt) return null;
    const emailVerifiedAt = new Date();
    // Separate $and clauses preserve both legacy-zero filters. Atomic matching
    // prevents late proof from verifying an email changed while this was running.
    const updated = await User.findOneAndUpdate({
        _id: attempt.user, email: attempt.email, emailVerifiedAt: null,
        $and: [versionFilter('emailVerificationVersion', attempt.emailVerificationVersion),
            versionFilter('sessionVersion', attempt.sessionVersion)],
    }, { $set: { emailVerifiedAt } }, { returnDocument: 'after', runValidators: true }).select('_id');
    return updated ? { userId: updated._id, emailVerifiedAt } : null;
}
