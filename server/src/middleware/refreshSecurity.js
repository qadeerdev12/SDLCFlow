// Cookie-auth request policy shared by login, refresh and account actions.
// Keep these origins identical to the credentialed CORS allowlist at integration.
export const REFRESH_CSRF_HEADER = 'X-SDLCFlow-CSRF';

export function createRefreshSecurity({ origins, localHttp = false, environment = process.env.NODE_ENV } = {}) {
    if (typeof localHttp !== 'boolean' || (localHttp && !['development', 'test'].includes(environment))) {
        throw new Error('HTTP refresh cookies are allowed only in explicit development/test mode');
    }
    if (!Array.isArray(origins) || !origins.length) throw new Error('Explicit refresh origins are required');
    const allowed = new Set(origins.map((origin) => {
        let url;
        try { url = new URL(origin); } catch { throw new Error('Invalid refresh origin'); }
        // Reject paths, credentials, wildcards and implicit URL normalization.
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (typeof origin !== 'string' || url.origin !== origin || url.hostname.includes('*')
            || (url.protocol !== 'https:' && !(localHttp && loopback && url.protocol === 'http:'))
            || (localHttp && !loopback)) {
            throw new Error('Refresh origins must be exact HTTPS origins (HTTP loopback in local mode only)');
        }
        return origin;
    }));
    const cookieName = localHttp ? 'sdlcflow_refresh_dev' : '__Host-sdlcflow_refresh';
    // No Domain attribute: do not share credentials with sibling subdomains.
    const cookieOptions = Object.freeze({ httpOnly: true, secure: !localHttp, sameSite: 'strict', path: '/' });

    function guard(req, res, next) {
        // Apply before body parsing/controllers so rejections cannot mutate auth state.
        res.set('Cache-Control', 'no-store');
        const site = req.get('Sec-Fetch-Site');
        if (!allowed.has(req.get('Origin')) || req.get(REFRESH_CSRF_HEADER) !== '1'
            || !req.is('application/json')
            || (site !== undefined && !['same-origin', 'same-site'].includes(site))) {
            return res.status(403).json({ error: { code: 'CSRF_REJECTED', message: 'Authentication request was not permitted.' } });
        }
        return next();
    }

    function setCookie(res, credential, expiresAt) {
        if (typeof credential !== 'string' || !/^[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(credential)
            || !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            throw new Error('A valid refresh credential and future session expiry are required');
        }
        res.set('Cache-Control', 'no-store');
        // Absolute Expires avoids granting another seven days on each rotation.
        res.cookie(cookieName, credential, { ...cookieOptions, expires: expiresAt });
    }

    function clearCookie(res) {
        res.set('Cache-Control', 'no-store');
        res.clearCookie(cookieName, cookieOptions);
    }

    return { guard, setCookie, clearCookie, cookieName };
}
