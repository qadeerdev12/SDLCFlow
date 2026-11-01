import { authBody, sendAuthError } from '../utils/authValidation.js';
import { issueEmailVerificationToken, completeEmailVerification } from '../services/emailVerificationService.js';
import { sendEmailVerificationEmail } from '../services/emailVerificationEmailService.js';
import { createAuthEmailDispatcher } from '../services/authEmailDispatcher.js';
import { getAccessSessionFamily } from '../services/accessSessionService.js';

export const VERIFICATION_REQUEST_MESSAGE = 'If your email needs verification, a link may be sent. Check your inbox and spam folder.';

export function createVerificationRequestHandler({ options, lifecycle }) {
    const dispatch = createAuthEmailDispatcher({ lifecycle,
        failureMessage: 'Email verification background delivery failed; no automatic retry' });
    return (req, res) => {
        try { authBody(req.body); } catch (error) {
            return sendAuthError(res, error, 'Verification request could not be processed');
        }
        if (!options) return res.status(503).json({ error: {
            code: 'EMAIL_VERIFICATION_UNAVAILABLE', message: 'Email verification is not available yet.',
        } });
        // Identity comes only from protect. Cooldown follows the account across
        // email edits. A body-supplied recipient, ID or origin is never trusted.
        const userId = req.user._id;
        const { sessionId, sessionVersion } = req.authSession;
        dispatch(String(userId), async () => {
            if (!await getAccessSessionFamily({ sessionId, userId, version: sessionVersion })) return;
            const issued = await issueEmailVerificationToken(userId, { expectedSessionVersion: sessionVersion });
            if (!issued) return;
            await sendEmailVerificationEmail({ options, email: issued.email, token: issued.token });
        });
        return res.status(202).json({ data: { message: VERIFICATION_REQUEST_MESSAGE } });
    };
}

export async function confirmEmailVerification(req, res) {
    try {
        const { token } = authBody(req.body);
        const result = await completeEmailVerification(token);
        if (!result) return res.status(400).json({ error: {
            code: 'EMAIL_VERIFICATION_INVALID', message: 'This verification link is invalid or expired. Request a new one.',
        } });
        // Proof does not grant login or disclose the account it belongs to.
        return res.json({ data: { verified: true } });
    } catch (error) {
        return sendAuthError(res, error, 'Email verification could not be completed. Request a new link.');
    }
}
