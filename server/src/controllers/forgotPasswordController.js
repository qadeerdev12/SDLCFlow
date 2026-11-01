import { createHash } from 'node:crypto';
import User from '../models/User.js';
import { accountEmail, authBody, sendAuthError } from '../utils/authValidation.js';
import { issuePasswordResetToken } from '../services/passwordResetTokenService.js';
import { sendPasswordRecoveryEmail } from '../services/passwordRecoveryEmailService.js';
import { createAuthEmailDispatcher } from '../services/authEmailDispatcher.js';

export const RECOVERY_REQUEST_MESSAGE = 'If an account exists for that email, a password reset link may be sent. Check your inbox and spam folder.';

/** Per-app, best-effort dispatch for our single-instance demo. There is no durable
 * queue: crashes can drop accepted work. Never promise delivery in the response.
 * All admission decisions are made before user lookup, even for unknown emails.
 */
export function createForgotPasswordHandler({ options, lifecycle }) {
    const dispatch = createAuthEmailDispatcher({ lifecycle,
        failureMessage: 'Password recovery background delivery failed; no automatic retry' });
    return (req, res) => {
        let email;
        try { email = accountEmail(authBody(req.body).email); } catch (error) {
            return sendAuthError(res, error, 'Password recovery request could not be processed');
        }
        if (!options) return res.status(503).json({ error: {
            code: 'PASSWORD_RECOVERY_UNAVAILABLE', message: 'Password recovery is not available yet.',
        } });
        const digest = createHash('sha256').update(email).digest('hex');
        // Limits bound mail costs and memory. They also count nonexistent accounts
        // and failures; exposing per-account limiter outcomes would enable probing.
        dispatch(digest, async () => {
            const user = await User.findOne({ email }).select('_id email').lean();
            if (!user) return;
            const issued = await issuePasswordResetToken(user._id);
            if (!issued) return;
            await sendPasswordRecoveryEmail({ options, email: user.email, token: issued.token });
        });
        return res.status(202).json({ data: { message: RECOVERY_REQUEST_MESSAGE } });
    };
}
