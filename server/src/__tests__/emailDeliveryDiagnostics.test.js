import { afterEach, expect, it, vi } from 'vitest';
import { sendBrevoEmail, EmailDeliveryError } from '../services/brevoEmailService.js';
import { createAuthEmailDispatcher } from '../services/authEmailDispatcher.js';

afterEach(() => vi.restoreAllMocks());
const options = { key: 'private-key', sender: { name: 'Test', email: 'private@example.com' } };

// Fake transport verifies useful status diagnostics without reading provider
// error bodies, exposing credentials, or sending a real message.
it.each([400, 401, 403, 429, 500])('retains only safe HTTP status %i', async (status) => {
    const json = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({ status, json });
    await expect(sendBrevoEmail({ options, email: 'recipient@example.com', textContent: 'secret-proof',
        failureMessage: 'Delivery failed', fetchImpl })).rejects.toMatchObject({
        message: 'Delivery failed', diagnostic: `BREVO_HTTP_${status}`,
    });
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
});

it.each(['network', 'json'])('distinguishes %s failures without preserving their secrets', async (kind) => {
    const fetchImpl = kind === 'network' ? vi.fn().mockRejectedValue(new Error('secret-proof'))
        : vi.fn().mockResolvedValue({ status: 201, json: async () => { throw new Error('secret-proof'); } });
    await expect(sendBrevoEmail({ options, failureMessage: 'Delivery failed', fetchImpl })).rejects.toMatchObject({
        message: 'Delivery failed', diagnostic: kind === 'network' ? 'BREVO_NETWORK_OR_TIMEOUT' : 'BREVO_INVALID_ACCEPTANCE',
    });
});

// Unknown/forged errors must not smuggle arbitrary strings into server logs.
it.each([
    [new Error('private-db-value'), 'PRE_SEND_OR_INTERNAL_FAILURE'],
    [new EmailDeliveryError('secret', 'BREVO_HTTP_401'), 'BREVO_HTTP_401'],
    [new EmailDeliveryError('secret', 'private-key'), 'PRE_SEND_OR_INTERNAL_FAILURE'],
])('logs a bounded diagnostic, not the original error', async (error, expected) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    const dispatch = createAuthEmailDispatcher({ failureMessage: 'Delivery failed', lifecycle: { track: () => finish } });
    dispatch('fake-account', async () => { throw error; });
    await done;
    expect(warn).toHaveBeenCalledExactlyOnceWith(`Delivery failed [${expected}]`);
});
