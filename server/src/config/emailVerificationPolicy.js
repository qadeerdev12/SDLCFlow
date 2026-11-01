// Read at app creation, not per request. Keep disabled until REST, sockets and
// the frontend gate are deployed together; mail delivery is a separate flag.
export function emailVerificationRequired(env = process.env) {
    const value = env.EMAIL_VERIFICATION_REQUIRED ?? 'false';
    if (!['true', 'false'].includes(value)) throw new Error('EMAIL_VERIFICATION_REQUIRED must be true or false');
    return value === 'true';
}
