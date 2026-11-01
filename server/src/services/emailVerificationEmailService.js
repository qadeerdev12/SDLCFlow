import { sendBrevoEmail } from './brevoEmailService.js';
import { EMAIL_VERIFICATION_LIFETIME_MS } from './emailVerificationService.js';

export async function sendEmailVerificationEmail({ options, email, token, fetchImpl }) {
    // A fragment avoids sending the secret on the initial page request. Brevo
    // still sees the message; tracking/retention review remains a launch gate.
    const url = new URL('/verify-email', options.origin);
    url.hash = new URLSearchParams({ token }).toString();
    return sendBrevoEmail({ options, email, fetchImpl, subject: 'Verify your SDLCFlow email',
        textContent: `Confirm this email address for your SDLCFlow account.\n\nOpen this link within ${EMAIL_VERIFICATION_LIFETIME_MS / 60_000} minutes:\n${url.href}\n\nThe link can be used once. Verification does not log you in or change your password. If you did not request this, ignore this email.`,
        failureMessage: 'Verification email was not confirmed accepted' });
}
