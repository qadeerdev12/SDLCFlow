// Callers supply fixed setting names, never request data. Both email flows
// require explicit opt-in and an allowlisted application origin.
export function authEmailOptions({ env = process.env, origins, localHttp = false, enabledKey, originKey } = {}) {
    const enabled = env[enabledKey] || 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error(`${enabledKey} must be true or false`);
    if (enabled === 'false') return null;
    let origin;
    try { origin = new URL(env[originKey]); } catch {
        throw new Error(`${originKey} must be an explicit application origin`);
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.origin !== env[originKey] || !origins?.includes(origin.origin)
        || (origin.protocol !== 'https:' && !(localHttp && loopback && origin.protocol === 'http:'))
        || (!localHttp && loopback)) {
        throw new Error(`${originKey} must match an allowed HTTPS application origin (HTTP loopback in local mode only)`);
    }
    const key = env.BREVO_API_KEY?.trim();
    const name = env.EMAIL_FROM_NAME?.trim();
    const email = env.EMAIL_FROM_ADDRESS?.trim();
    if (!key || /[\r\n]/.test(key)) throw new Error('A valid BREVO_API_KEY is required for email delivery');
    if (!name || name.length > 128 || /[\r\n]/.test(name)) throw new Error('A valid EMAIL_FROM_NAME is required for email delivery');
    if (!email || email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
        throw new Error('A valid EMAIL_FROM_ADDRESS is required for email delivery');
    }
    return { origin: origin.origin, key, sender: { name, email } };
}
