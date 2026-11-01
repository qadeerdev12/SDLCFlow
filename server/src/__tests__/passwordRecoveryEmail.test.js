import { expect, it, vi } from 'vitest';
import { sendPasswordRecoveryEmail } from '../services/passwordRecoveryEmailService.js';

const options = { origin: 'https://app.example.com', key: 'test-secret', sender: { name: 'SDLCFlow', email: 'sender@example.com' } };
const token = 'a'.repeat(64);
const send = (fetchImpl) => sendPasswordRecoveryEmail({ options, token, email: 'user@example.com', fetchImpl });

// Provider tests never read .env or perform network requests.
it('sends one plain-text message with a fragment token, timeout and no redirects', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 201, json: async () => ({ messageId: 'test-id' }) });
    await send(fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'api-key': 'test-secret' } });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body);
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(body.textContent).toContain(`https://app.example.com/reset-password#token=${token}`);
    expect(body.textContent).toContain('15 minutes');
    expect(body.htmlContent).toBeUndefined();
});

// A timeout/rejection must not retry or expose raw provider content in logs/errors.
it.each([401, 403, 429, 500])('sanitizes HTTP %i and never reads its error body', async (status) => {
    const json = vi.fn();
    const fetch = vi.fn().mockResolvedValue({ status, json });
    await expect(send(fetch)).rejects.toThrow('Password recovery email was not confirmed accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
});
it.each(['network', 'invalid-json', 'missing-id'])('fails closed on %s', async (kind) => {
    const fetch = vi.fn().mockResolvedValue({ status: 201, json: async () => {
        if (kind === 'invalid-json') throw new Error(token);
        return {};
    } });
    if (kind === 'network') fetch.mockRejectedValue(new Error(token));
    await expect(send(fetch)).rejects.toThrow('Password recovery email was not confirmed accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
});
