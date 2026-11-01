import { sendBrevoEmail } from './brevoEmailService.js';

export async function sendPasswordRecoveryEmail({ options, email, token, fetchImpl }) {
    const url = new URL('/reset-password', options.origin);
    url.hash = new URLSearchParams({ token }).toString();
    return sendBrevoEmail({ options, email, fetchImpl, subject: 'Reset your SDLCFlow password',
        textContent: `A password reset was requested for your SDLCFlow account.\n\nOpen this link within 15 minutes:\n${url.href}\n\nThe link can be used once. If you did not request this, ignore this email; your password has not changed.`,
        failureMessage: 'Password recovery email was not confirmed accepted' });
}
