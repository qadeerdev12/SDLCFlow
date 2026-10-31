import { describe, expect, it, vi } from 'vitest';
import { checkEmail } from '../../scripts/check-email.mjs';

const env = {
    BREVO_API_KEY: 'fake-test-key',
    EMAIL_FROM_NAME: 'SDLCFlow',
    EMAIL_FROM_ADDRESS: 'owner@example.com',
};
const run = (fetchImpl, overrides = {}) => checkEmail({ args: ['--send'], env, fetchImpl, ...overrides });

describe('Manual email delivery check', () => {
    // An accidental invocation must never send a message or consume provider quota.
    it.each([{ args: [] }, { args: ['--send', '--extra'] }, { args: ['--help'] }])('requires explicit send arguments %j', async ({ args }) => {
        const fetch = vi.fn();
        await expect(run(fetch, { args })).rejects.toThrow('Usage:');
        expect(fetch).not.toHaveBeenCalled();
    });

    // Fail locally before sending malformed configuration to an external service.
    it.each([
        { BREVO_API_KEY: '' }, { EMAIL_FROM_NAME: '' },
        { EMAIL_FROM_ADDRESS: 'invalid' }, { EMAIL_FROM_ADDRESS: 'owner@example.com\r\nBcc: other@example.com' },
    ])('rejects invalid configuration %j', async (invalid) => {
        const fetch = vi.fn();
        await expect(run(fetch, { env: { ...env, ...invalid } })).rejects.toThrow('Set a valid');
        expect(fetch).not.toHaveBeenCalled();
    });

    // The probe is limited to one self-addressed email, never an arbitrary user list.
    it('sends a bounded request and reports acceptance, not delivery', async () => {
        const fetch = vi.fn().mockResolvedValue({ status: 201, json: async () => ({ messageId: 'test-id' }) });
        await expect(run(fetch)).resolves.toContain('acceptance does not confirm delivery');
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, options] = fetch.mock.calls[0];
        expect(url).toBe('https://api.brevo.com/v3/smtp/email');
        expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'api-key': env.BREVO_API_KEY } });
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(JSON.parse(options.body)).toMatchObject({ sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS }, to: [{ email: env.EMAIL_FROM_ADDRESS }] });
    });

    // Provider responses can include private data; expose only safe status guidance.
    it.each([400, 401, 403, 429, 500])('sanitizes HTTP %i without retrying', async (status) => {
        const json = vi.fn();
        const fetch = vi.fn().mockResolvedValue({ status, json });
        await expect(run(fetch)).rejects.toThrow(`HTTP ${status}`);
        expect(json).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    // Network failures can happen after a send; never blindly retry or print secrets.
    it('redacts transport failures and leaves delivery unknown', async () => {
        const fetch = vi.fn().mockRejectedValue(new Error('private-provider-data'));
        await expect(run(fetch)).rejects.toThrow('Delivery is unknown');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([{}, { messageId: '' }])('does not claim acceptance without a message ID', async (body) => {
        await expect(run(vi.fn().mockResolvedValue({ status: 201, json: async () => body })))
            .rejects.toThrow('unexpected acceptance response');
    });
});
