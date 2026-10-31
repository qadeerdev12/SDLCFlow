export function httpSafety(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
}

// Preserve controller-owned domain errors. Only errors escaping to Express
// reach this final handler; neither parser bodies nor stack traces are exposed.
export function httpError(err, req, res, next) {
    if (res.headersSent) return next(err);
    const known = {
        'entity.parse.failed': [400, 'INVALID_JSON', 'Request body must be valid JSON.'],
        'entity.too.large': [413, 'BODY_TOO_LARGE', 'Request body is too large.'],
        'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Request encoding is not supported.'],
        'charset.unsupported': [415, 'UNSUPPORTED_ENCODING', 'Request encoding is not supported.'],
    };
    const [status, code, message] = known[err.type] || [500, 'INTERNAL_ERROR', 'Something went wrong.'];
    if (status === 500) console.error('Unhandled HTTP request error');
    res.set('Cache-Control', 'no-store').status(status).json({ error: { code, message } });
}
