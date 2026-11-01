import { createHash } from 'node:crypto';
import User from '../models/User.js';
import { accountEmail, authBody, sendAuthError } from '../utils/authValidation.js';
import { issuePasswordResetToken } from '../services/passwordResetTokenService.js';
import { sendPasswordRecoveryEmail } from '../services/passwordRecoveryEmailService.js';

export const RECOVERY_REQUEST_MESSAGE = 'If an account exists for that email, a password reset link may be sent. Check your inbox and spam folder.';
const HOUR = 60 * 60 * 1000;
const COOLDOWN = 15 * 60 * 1000;

/** Per-app, best-effort dispatch for our single-instance demo. There is no durable
 * queue: crashes can drop accepted work. Never promise delivery in the response.
 * All admission decisions are made before user lookup, even for unknown emails.
 */
export function createForgotPasswordHandler({ options, lifecycle }) {
    let active = 0, windowStart = Date.now(), admitted = 0;
    const cooldowns = new Map();
    return (req, res) => {
        let email;
        try { email = accountEmail(authBody(req.body).email); } catch (error) {
            return sendAuthError(res, error, 'Password recovery request could not be processed');
        }
        if (!options) return res.status(503).json({ error: {
            code: 'PASSWORD_RECOVERY_UNAVAILABLE', message: 'Password recovery is not available yet.',
        } });
        const now = Date.now();
        if (now - windowStart >= HOUR) { windowStart = now; admitted = 0; }
        for (const [key, expiry] of cooldowns) if (expiry <= now) cooldowns.delete(key);
        const digest = createHash('sha256').update(email).digest('hex');
        // Limits bound mail costs and memory. They also count nonexistent accounts
        // and failures; exposing per-account limiter outcomes would enable probing.
        const accept = !lifecycle?.draining && active < 4 && admitted < 20 && !cooldowns.has(digest);
        if (accept) {
            active++;
            admitted++;
            cooldowns.set(digest, now + COOLDOWN);
            const finish = lifecycle?.track();
            // Acknowledge independently of database/provider latency. Track work
            // before responding so graceful shutdown cannot close MongoDB early.
            setImmediate(async () => {
                try {
                    const user = await User.findOne({ email }).select('_id email').lean();
                    if (!user) return;
                    const issued = await issuePasswordResetToken(user._id);
                    if (!issued) return;
                    // The recipient comes from storage, not extra request fields.
                    await sendPasswordRecoveryEmail({ options, email: user.email, token: issued.token });
                } catch {
                    console.warn('Password recovery background delivery failed; no automatic retry');
                } finally {
                    active--;
                    finish?.();
                }
            });
        }
        return res.status(202).json({ data: { message: RECOVERY_REQUEST_MESSAGE } });
    };
}
