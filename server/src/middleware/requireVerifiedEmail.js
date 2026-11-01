/** Mount after protect on routes that require verified ownership of an email.
 * protect loads this hidden field freshly from storage; never use a JWT claim,
 * request body, or the public emailVerified boolean as authorization evidence.
 * This guard neither authenticates sessions nor replaces board/role checks.
 * Resource routes use it through protectVerified, behind the rollout policy.
 */
export function requireVerifiedEmail(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: {
            code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.',
        } });
    }

    // Legacy accounts lack this field. Missing projections and malformed state
    // also fail closed instead of treating any truthy value as verified.
    const verifiedAt = req.user.emailVerifiedAt;
    if (!(verifiedAt instanceof Date) || !Number.isFinite(verifiedAt.getTime())) {
        return res.status(403).json({ error: {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Verify your email address to access this feature.',
        } });
    }

    return next();
}
