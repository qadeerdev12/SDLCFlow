// Pure config and transport tests: fake fetch only, no .env or provider traffic.
import { expect, it, vi } from 'vitest';
import { emailVerificationOptions } from '../config/emailVerification.js';
import { checkAuthDeployment } from '../config/authDeployment.js';
import { sendEmailVerificationEmail } from '../services/emailVerificationEmailService.js';
const env = { EMAIL_VERIFICATION_ENABLED: 'true', EMAIL_VERIFICATION_ORIGIN: 'https://app.example.com',
    BREVO_API_KEY: 'fake-key', EMAIL_FROM_NAME: 'SDLCFlow', EMAIL_FROM_ADDRESS: 'sender@example.test' };
const options = emailVerificationOptions({ env, origins: ['https://app.example.com'] });
const token = 'a'.repeat(64);

it('defaults verification delivery off independently of recovery', () => {
    expect(emailVerificationOptions({ env: { PASSWORD_RECOVERY_ENABLED: 'true' } })).toBeNull();
});
it.each(['https://evil.example', 'https://app.example.com/path', 'https://app.example.com#x', 'http://localhost:5173'])(
    'rejects unsafe verification origin %s', (origin) => {
        expect(() => emailVerificationOptions({ env: { ...env, EMAIL_VERIFICATION_ORIGIN: origin }, origins: ['https://app.example.com', 'http://localhost:5173'] }))
            .toThrow('EMAIL_VERIFICATION_ORIGIN');
    },
);
it('validates preflight without returning the key and rejects invalid enabled settings', () => {
    const server = { ...env, EMAIL_VERIFICATION_ORIGIN: 'http://localhost:5173' };
    const result = checkAuthDeployment({ mode: 'local', server });
    expect(result.emailVerificationEnabled).toBe(true);
    expect(JSON.stringify(result)).not.toContain(env.BREVO_API_KEY);
    expect(() => checkAuthDeployment({ mode: 'local', server: { ...server, BREVO_API_KEY: '' } })).toThrow('BREVO_API_KEY');
    expect(() => emailVerificationOptions({ env: { EMAIL_VERIFICATION_ENABLED: 'yes' } })).toThrow('EMAIL_VERIFICATION_ENABLED');
});
it('sends a trusted fragment link with matching expiry, no redirects and a bounded timeout', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 201, json: async () => ({ messageId: 'test-id' }) });
    await sendEmailVerificationEmail({ options, email: 'owner@example.test', token, fetchImpl: fetch });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'api-key': 'fake-key' } });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body);
    expect(body.to).toEqual([{ email: 'owner@example.test' }]);
    expect(body.textContent).toContain(`https://app.example.com/verify-email#token=${token}`);
    expect(body.textContent).toContain('60 minutes');
    expect(body.textContent).toContain('does not log you in');
});
it.each([401, 403, 429, 500, 'network', 'invalid-json', 'missing-id'])('sanitizes %s and never retries', async (failure) => {
    const json = vi.fn(async () => {
        if (failure === 'invalid-json') throw new Error(token);
        return {};
    });
    const fetch = vi.fn().mockResolvedValue({ status: typeof failure === 'number' ? failure : 201, json });
    if (failure === 'network') fetch.mockRejectedValue(new Error(token));
    await expect(sendEmailVerificationEmail({ options, email: 'owner@example.test', token, fetchImpl: fetch }))
        .rejects.toThrow('Verification email was not confirmed accepted');
    expect(fetch).toHaveBeenCalledTimes(1);
    if (typeof failure === 'number') expect(json).not.toHaveBeenCalled();
});
