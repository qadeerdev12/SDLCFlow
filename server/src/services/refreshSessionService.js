import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import RefreshSession, { MAX_REFRESH_ROTATIONS, REFRESH_LIFETIME_MS } from '../models/RefreshSession.js';
import User from '../models/User.js';
import { sessionVersion } from '../utils/sessionTokens.js';

const digest = (credential) => createHash('sha256').update(credential).digest('hex');
const credentialFor = (id) => `${id}.${randomBytes(32).toString('base64url')}`;

function reject(code = 'REFRESH_INVALID', sessionId) {
    const error = new Error('Session renewal requires signing in again.');
    error.statusCode = 401;
    error.code = code;
    // Internal metadata for future socket eviction, never the submitted secret.
    if (sessionId) error.sessionId = String(sessionId);
    throw error;
}

function result(session, credential) {
    return { credential, sessionId: String(session._id), userId: String(session.user),
        sessionVersion: session.sessionVersion, expiresAt: session.expiresAt };
}

/** Internal issuance boundary: pass a credential-verified user with version selected.
 * Not wired into login yet. Raw credentials belong only in the eventual cookie.
 */
export async function createRefreshSession(user) {
    const version = sessionVersion(user.sessionVersion);
    if (user.sessionVersion === undefined || version === null) {
        throw new Error('A selected, valid session version is required');
    }
    const id = new mongoose.Types.ObjectId();
    const credential = credentialFor(id);
    const session = await RefreshSession.create({ _id: id, user: user._id,
        sessionVersion: version, currentDigest: digest(credential),
        expiresAt: new Date(Date.now() + REFRESH_LIFETIME_MS) });
    return result(session, credential);
}

/** Single-use rotation. Callers must serialize refreshes, not retry old secrets.
 * HTTP policy lives in the unmounted refresh router; socket eviction is pending.
 */
export async function rotateRefreshSession(credential) {
    if (typeof credential !== 'string' || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(credential)) reject();
    const id = credential.slice(0, 24);
    const submittedDigest = digest(credential);
    const active = () => ({ _id: id, revokedAt: null, expiresAt: { $gt: new Date() } });
    const session = await RefreshSession.findOne(active()).lean();
    if (!session) reject();
    const user = await User.findById(session.user).select('+sessionVersion').lean();
    if (!user || sessionVersion(user.sessionVersion) !== session.sessionVersion) reject();

    const replacement = credentialFor(id);
    const now = new Date();
    // CAS consumes the old digest and records it in the same document write.
    // Keep the captured account version: a concurrent logout-all still wins.
    const updated = await RefreshSession.findOneAndUpdate({ ...active(),
        currentDigest: submittedDigest, rotationCount: { $lt: MAX_REFRESH_ROTATIONS },
    }, { $set: { currentDigest: digest(replacement), lastRefreshedAt: now },
        $push: { consumedDigests: submittedDigest }, $inc: { rotationCount: 1 },
    }, { returnDocument: 'after', runValidators: true }).lean();
    if (updated) return result(updated, replacement);

    // Query again atomically: another refresh may have consumed this very token
    // since our read. A guessed secret with a real selector must never revoke it.
    const replay = await RefreshSession.findOneAndUpdate({ ...active(), consumedDigests: submittedDigest },
        { $set: { revokedAt: now, revocationReason: 'replay' } }, { returnDocument: 'after' }).lean();
    if (replay) reject('REFRESH_REUSED', id);
    const exhausted = await RefreshSession.findOneAndUpdate({ ...active(),
        currentDigest: submittedDigest, rotationCount: { $gte: MAX_REFRESH_ROTATIONS },
    }, { $set: { revokedAt: now, revocationReason: 'rotation_limit' } }, { returnDocument: 'after' }).lean();
    if (exhausted) reject('REFRESH_EXHAUSTED', id);
    reject();
}

/** A known current OR consumed secret can end only its own family. This lets
 * logout win against a racing rotation, without trusting a client-supplied ID.
 * Return the matched ID even on repeated logout for idempotent future eviction.
 */
export async function revokeRefreshSession(credential) {
    if (typeof credential !== 'string' || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(credential)) reject();
    const filter = { _id: credential.slice(0, 24), $or: [
        { currentDigest: digest(credential) }, { consumedDigests: digest(credential) },
    ] };
    const updated = await RefreshSession.findOneAndUpdate({ ...filter, revokedAt: null },
        { $set: { revokedAt: new Date(), revocationReason: 'logout' } },
        { returnDocument: 'after', runValidators: true }).lean();
    const matched = updated || await RefreshSession.findOne(filter).lean();
    if (!matched) reject();
    return { sessionId: String(matched._id) };
}
