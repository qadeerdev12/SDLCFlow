import { authEmailOptions } from './authEmail.js';

export function emailVerificationOptions(options = {}) {
    return authEmailOptions({ ...options, enabledKey: 'EMAIL_VERIFICATION_ENABLED', originKey: 'EMAIL_VERIFICATION_ORIGIN' });
}
