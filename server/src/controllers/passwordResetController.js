import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { authBody, newAccountPassword, sendAuthError } from '../utils/authValidation.js';
import { consumePasswordResetToken } from '../services/passwordResetTokenService.js';
import { revokeSocketSessions } from '../services/socketSessionService.js';

// POST only: email scanners opening a future reset link must never consume it.
export async function completePasswordReset(req, res) {
    try {
        const body = authBody(req.body);
        // Correctable password mistakes must not burn the user's one-time link.
        const password = newAccountPassword(body.newPassword);
        const claim = await consumePasswordResetToken(body.token);
        if (!claim) return res.status(400).json({ error: {
            code: 'PASSWORD_RESET_INVALID', message: 'This reset link is invalid or expired. Request a new one.',
        } });
        const version = claim.sessionVersion;
        if (!Number.isSafeInteger(version) || version < 0 || version === Number.MAX_SAFE_INTEGER) {
            throw new Error('Invalid reset session version');
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const versionFilter = version === 0
            ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
            : { sessionVersion: version };
        // A password change, logout-all, deletion, or another reset can win while
        // bcrypt runs. Commit credentials and revocation together, or not at all.
        const updated = await User.findOneAndUpdate(
            { _id: claim.userId, ...versionFilter },
            { $set: { passwordHash }, $inc: { sessionVersion: 1 } },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) return res.status(409).json({ error: {
            code: 'PASSWORD_RESET_CONFLICT', message: 'Your account changed during this reset. Request a new reset link.',
        } });
        // The version bump invalidates all old access/refresh credentials without
        // deleting newer login families. Evict idle and pending sockets as well.
        revokeSocketSessions(req.app.get('io'), claim.userId, version + 1);
        res.locals.refreshSecurity?.clearCookie(res);
        return res.status(200).json({ data: { updated: true } });
    } catch (error) {
        // A consumed token stays spent on failure. Never log secrets or issue a
        // replacement session; recovery completion requires an explicit login.
        return sendAuthError(res, error, 'Password reset could not be completed. Request a new reset link.');
    }
}
