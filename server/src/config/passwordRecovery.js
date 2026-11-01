import { authEmailOptions } from './authEmail.js';

export function passwordRecoveryOptions(options = {}) {
    return authEmailOptions({ ...options, enabledKey: 'PASSWORD_RECOVERY_ENABLED', originKey: 'PASSWORD_RESET_ORIGIN' });
}
