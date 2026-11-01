// Delivery is opt-in until the reset form and sender configuration are ready.
export function passwordRecoveryOptions({ env = process.env, origins, localHttp = false } = {}) {
    const enabled = env.PASSWORD_RECOVERY_ENABLED || 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error('PASSWORD_RECOVERY_ENABLED must be true or false');
    if (enabled === 'false') return null;
    let origin;
    try { origin = new URL(env.PASSWORD_RESET_ORIGIN); } catch {
        throw new Error('PASSWORD_RESET_ORIGIN must be an explicit application origin');
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.origin !== env.PASSWORD_RESET_ORIGIN || !origins?.includes(origin.origin)
        || (origin.protocol !== 'https:' && !(localHttp && loopback && origin.protocol === 'http:'))
        || (!localHttp && loopback)) {
        throw new Error('PASSWORD_RESET_ORIGIN must match an allowed HTTPS application origin (HTTP loopback in local mode only)');
    }
    const key = env.BREVO_API_KEY?.trim();
    const name = env.EMAIL_FROM_NAME?.trim();
    const email = env.EMAIL_FROM_ADDRESS?.trim();
    if (!key || /[\r\n]/.test(key)) throw new Error('A valid BREVO_API_KEY is required for recovery');
    if (!name || name.length > 128 || /[\r\n]/.test(name)) throw new Error('A valid EMAIL_FROM_NAME is required for recovery');
    if (!email || email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
        throw new Error('A valid EMAIL_FROM_ADDRESS is required for recovery');
    }
    return { origin: origin.origin, key, sender: { name, email } };
}
