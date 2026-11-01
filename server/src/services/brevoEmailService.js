/** Provider boundary: no retries, raw error logging, or request-selected URLs.
 * Acceptance is not delivery. A timeout can occur after Brevo accepts the mail.
 */
export class EmailDeliveryError extends Error {
    constructor(message, diagnostic) {
        super(message);
        this.diagnostic = diagnostic;
    }
}

export async function sendBrevoEmail({ options, email, subject, textContent, failureMessage, fetchImpl = globalThis.fetch }) {
    let diagnostic = 'BREVO_NETWORK_OR_TIMEOUT';
    try {
        const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
            headers: { 'api-key': options.key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: options.sender, to: [{ email }], subject, textContent,
            }),
        });
        if (response.status !== 201) {
            diagnostic = Number.isInteger(response.status) && response.status >= 400 && response.status <= 599
                ? `BREVO_HTTP_${response.status}` : 'BREVO_UNEXPECTED_RESPONSE';
            throw new Error('Provider rejected request');
        }
        diagnostic = 'BREVO_INVALID_ACCEPTANCE';
        const result = await response.json();
        if (typeof result?.messageId !== 'string' || !result.messageId.trim()) throw new Error('Unexpected response');
    } catch {
        // Do not expose provider bodies, recipient addresses, keys or reset URLs.
        throw new EmailDeliveryError(failureMessage, diagnostic);
    }
}
