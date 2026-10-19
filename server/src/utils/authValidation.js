export class AuthValidationError extends Error {}

export function authBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AuthValidationError('A JSON object is required.');
    }
    return body;
}

export function accountName(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 100) {
        throw new AuthValidationError('Name must contain 1 to 100 characters.');
    }
    return value.trim();
}

export function accountEmail(value) {
    // Reject query selectors before the value can reach a MongoDB filter.
    if (typeof value !== 'string' || value.length > 254) {
        throw new AuthValidationError('Enter a valid email address (up to 254 characters).');
    }
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AuthValidationError('Enter a valid email address.');
    }
    return email;
}

export function credentialPassword(value) {
    // Verification must still accept legacy short passwords. Never trim secrets.
    if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > 1024) {
        throw new AuthValidationError('Password must be a non-empty string of at most 1024 bytes.');
    }
    return value;
}

export function newAccountPassword(value) {
    credentialPassword(value);
    if ([...value].length < 15) {
        throw new AuthValidationError('Use at least 15 characters for your new password.');
    }
    // bcrypt silently ignores bytes beyond 72, so reject rather than truncate.
    if (Buffer.byteLength(value, 'utf8') > 72) {
        throw new AuthValidationError('Password must not exceed 72 UTF-8 bytes. Unicode characters may use multiple bytes.');
    }
    return value;
}

export function sendAuthError(res, error, message) {
    if (error instanceof AuthValidationError) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: error.message } });
    }
    // The unique index also handles concurrent registrations/profile updates.
    if (error.code === 11000) {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' } });
    }
    // Database errors can contain submitted values. Never log raw auth errors.
    console.error(message);
    return res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message } });
}
