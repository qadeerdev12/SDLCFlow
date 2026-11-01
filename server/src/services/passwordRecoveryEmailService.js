/** Provider boundary: no retries, raw error logging, or request-selected URLs.
 * Acceptance is not delivery. A timeout can occur after Brevo accepts the mail.
 */
export async function sendPasswordRecoveryEmail({ options, email, token, fetchImpl = globalThis.fetch }) {
    const url = new URL('/reset-password', options.origin);
    // The future form reads then clears the fragment; it is not sent in the
    // initial HTTP request. The email provider still sees the full message.
    url.hash = new URLSearchParams({ token }).toString();
    try {
        const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
            headers: { 'api-key': options.key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: options.sender, to: [{ email }], subject: 'Reset your SDLCFlow password',
                textContent: `A password reset was requested for your SDLCFlow account.\n\nOpen this link within 15 minutes:\n${url.href}\n\nThe link can be used once. If you did not request this, ignore this email; your password has not changed.`,
            }),
        });
        if (response.status !== 201) throw new Error('Provider rejected request');
        const result = await response.json();
        if (typeof result?.messageId !== 'string' || !result.messageId.trim()) throw new Error('Unexpected response');
    } catch {
        // Do not expose provider bodies, recipient addresses, keys or reset URLs.
        throw new Error('Password recovery email was not confirmed accepted');
    }
}
