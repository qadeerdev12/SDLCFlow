// Tests environment-to-cookie-policy selection without starting a server.
// Only explicit development/test environments may relax HTTPS requirements;
// an absent or misspelled environment must not silently weaken authentication.

import { expect, it } from 'vitest';
import { authRuntimeOptions } from '../config/authRuntime.js';
import { createRefreshSecurity } from '../middleware/refreshSecurity.js';

it.each(['development', 'test'])('allows explicit loopback HTTP in %s', (NODE_ENV) => {
    const options = authRuntimeOptions({ NODE_ENV });
    expect(options).toEqual({ localHttp: true, environment: NODE_ENV });
    expect(() => createRefreshSecurity({ ...options, origins: ['http://localhost:5173'] })).not.toThrow();
    expect(() => createRefreshSecurity({ ...options, origins: ['http://app.example.com'] })).toThrow();
});

it.each([undefined, 'production'])('defaults to secure cookies and explicit origins with NODE_ENV=%s', (NODE_ENV) => {
    expect(() => authRuntimeOptions({ NODE_ENV })).toThrow('explicit HTTPS CLIENT_ORIGIN');
    const options = authRuntimeOptions({ NODE_ENV, CLIENT_ORIGIN: 'https://app.example.com' });
    expect(options.localHttp).toBe(false);
    expect(() => createRefreshSecurity({ ...options, origins: ['http://localhost:5173'] })).toThrow();
});

it('rejects misspelled environment names instead of guessing security policy', () => {
    expect(() => authRuntimeOptions({ NODE_ENV: 'prodution' })).toThrow('NODE_ENV');
});
