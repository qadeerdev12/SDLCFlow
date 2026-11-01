import { describe, expect, it } from 'vitest';
import { passwordRecoveryOptions } from '../config/passwordRecovery.js';
import { checkAuthDeployment } from '../config/authDeployment.js';

const env = { PASSWORD_RECOVERY_ENABLED: 'true', PASSWORD_RESET_ORIGIN: 'https://app.example.com',
    BREVO_API_KEY: 'fake-key', EMAIL_FROM_NAME: 'SDLCFlow', EMAIL_FROM_ADDRESS: 'sender@example.com' };
const configure = (overrides = {}, localHttp = false) => passwordRecoveryOptions({
    env: { ...env, ...overrides }, origins: ['https://app.example.com', 'http://localhost:5173'], localHttp,
});

describe('Password recovery startup configuration', () => {
    it('defaults off without requiring credentials or creating any delivery capability', () => {
        expect(passwordRecoveryOptions({ env: {} })).toBeNull();
    });
    it('validates recovery in deployment preflight without returning mail secrets', () => {
        const server = { ...env, PASSWORD_RESET_ORIGIN: 'http://localhost:5173' };
        const result = checkAuthDeployment({ mode: 'local', server });
        expect(result.passwordRecoveryEnabled).toBe(true);
        expect(JSON.stringify(result)).not.toContain(env.BREVO_API_KEY);
        expect(() => checkAuthDeployment({ mode: 'local', server: { ...server, BREVO_API_KEY: '' } }))
            .toThrow('BREVO_API_KEY');
    });
    it('accepts a trusted HTTPS origin and allows HTTP only for explicit local mode', () => {
        expect(configure().origin).toBe(env.PASSWORD_RESET_ORIGIN);
        expect(configure({ PASSWORD_RESET_ORIGIN: 'http://localhost:5173' }, true).origin).toBe('http://localhost:5173');
    });
    // Reject open redirects, injected paths, and accidental production HTTP links.
    it.each(['https://evil.example', 'https://app.example.com/', 'https://app.example.com/path',
        'https://app.example.com?token=x', 'https://app.example.com#x', 'https://u:p@app.example.com',
        'http://localhost:5173', 'not-a-url'])('rejects unsafe reset origin %s', (origin) => {
        expect(() => configure({ PASSWORD_RESET_ORIGIN: origin })).toThrow('PASSWORD_RESET_ORIGIN');
    });
    it.each([{ PASSWORD_RECOVERY_ENABLED: 'yes' }, { BREVO_API_KEY: '' },
        { EMAIL_FROM_NAME: '' }, { EMAIL_FROM_ADDRESS: 'bad' }])('fails startup on invalid enabled config %j', (overrides) => {
        expect(() => configure(overrides)).toThrow();
    });
});
