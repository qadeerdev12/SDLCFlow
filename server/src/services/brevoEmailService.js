/** Provider boundary: no retries, raw error logging, or request-selected URLs.
 * Acceptance is not delivery. A timeout can occur after Brevo accepts the mail.
 */
export async function sendBrevoEmail({ options, email, subject, textContent, failureMessage, fetchImpl = globalThis.fetch }) {
    try {
        const response = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
            headers: { 'api-key': options.key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: options.sender, to: [{ email }], subject, textContent,
            }),
        });
        if (response.status !== 201) throw new Error('Provider rejected request');
        const result = await response.json();
        if (typeof result?.messageId !== 'string' || !result.messageId.trim()) throw new Error('Unexpected response');
    } catch {
        // Do not expose provider bodies, recipient addresses, keys or reset URLs.
        throw new Error(failureMessage);
    }
}
