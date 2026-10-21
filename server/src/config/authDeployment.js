import { createRefreshSecurity } from '../middleware/refreshSecurity.js';

function parseUrl(value, label, path) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${label} must be an absolute URL`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || url.search || url.hash || url.pathname !== path) {
        throw new Error(`${label} must have path ${path}, without credentials, query or fragment`);
    }
    return url;
}

/** Read-only cutover preflight, not an authentication-mode selector. Deliberately
 * accepts only same-host layouts; sibling domains need an explicit deployment
 * review, not a naive last-two-label guess at the public suffix boundary.
 */
export function checkAuthDeployment({ server = {}, client = {}, mode } = {}) {
    if (!['local', 'production'].includes(mode)) throw new Error('Select --local or --production explicitly');
    const local = mode === 'local';
    if (local && server.NODE_ENV === 'production') throw new Error('Local cookie mode cannot be used with NODE_ENV=production');
    const required = (value, fallback, label) => {
        if (value) return value;
        if (local) return fallback;
        throw new Error(`${label} must be set explicitly for production`);
    };
    const origins = required(server.CLIENT_ORIGIN, 'http://localhost:5173,http://127.0.0.1:5173', 'CLIENT_ORIGIN')
        .split(',').map((value) => value.trim()).filter(Boolean);
    const frontend = parseUrl(required(server.CLIENT_URL, 'http://localhost:5173', 'CLIENT_URL'), 'CLIENT_URL', '/');
    const api = parseUrl(required(client.VITE_API_URL, 'http://localhost:5050/api/v1', 'VITE_API_URL'), 'VITE_API_URL', '/api/v1');
    const socket = parseUrl(required(client.VITE_SOCKET_URL, 'http://localhost:5050', 'VITE_SOCKET_URL'), 'VITE_SOCKET_URL', '/');
    const refresh = { localHttp: local, environment: local ? 'development' : 'production' };
    // Reuse the actual cookie guard's validation so preflight cannot approve
    // origins that app construction would later reject.
    const security = createRefreshSecurity({ ...refresh, origins });
    if (!origins.includes(frontend.origin)) throw new Error('CLIENT_ORIGIN must include the exact CLIENT_URL origin');
    const loopback = ['localhost', '127.0.0.1', '[::1]'];
    for (const url of [frontend, api, socket]) {
        if (local && (url.protocol !== 'http:' || !loopback.includes(url.hostname))) {
            throw new Error('Local preflight requires HTTP loopback URLs');
        }
        if (!local && (url.protocol !== 'https:' || loopback.includes(url.hostname))) {
            throw new Error('Production preflight requires non-loopback HTTPS URLs');
        }
    }
    if (frontend.hostname !== api.hostname || frontend.protocol !== api.protocol) {
        throw new Error('Frontend and API must use the same hostname and scheme for this preflight. Other layouts require a same-site deployment review; do not weaken cookie security.');
    }
    if (socket.origin !== api.origin) throw new Error('VITE_SOCKET_URL must match the API origin served by the shared HTTP/Socket.IO server');
    const warnings = origins.filter((origin) => new URL(origin).hostname !== api.hostname)
        .map(() => 'An additional allowed frontend hostname cannot use this API URL with the current cookie policy. Use matching URLs or remove that unused origin.');
    return { mode, origins, frontend: frontend.origin, api: api.href, socket: socket.origin,
        refresh, cookieName: security.cookieName, warnings };
}
