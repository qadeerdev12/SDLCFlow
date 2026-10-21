# Authentication Cutover Readiness

Status: the full Express application can now be constructed with refresh-cookie
authentication enabled explicitly. Production/development entry points remain
legacy by default; this is not the live cutover.

## Full-App Construction

Run the read-only [origin configuration preflight](auth-origin-configuration.md)
before changing entry points. It validates local URLs and conservative production
layouts without enabling memory mode or editing environment files.

The application factory accepts a server-owned `refresh` option:

```js
// With CLIENT_ORIGIN set to exact HTTPS origins:
const app = createApp({ refresh: {} });

// Local HTTP testing only, with loopback CLIENT_ORIGIN values:
const app = createApp({
  refresh: { localHttp: true, environment: 'development' },
});
```

No request body, browser storage flag or environment toggle selects this option.
The live `index.js` still calls `createApp()` without it.

The factory supplies `CLIENT_ORIGIN` to both credentialed CORS and the refresh
security guard. A separate `refresh.origins` option is rejected to prevent
divergent allowlists. Refresh security validates exact origins at construction,
before listening for requests. HTTP requires explicit development/test mode and
loopback origins. Production cannot use the local HTTP cookie mode.

An invalid refresh configuration fails construction; it does not silently fall
back to legacy authentication. Ordinary resource endpoints still require bearer
tokens. CORS permission alone does not authorize an authentication mutation:
the existing Origin, content-type, CSRF-header and Fetch Metadata checks remain.

## Readiness Findings

Implemented and tested:

- Refresh issuance, rotation and account actions through the real app factory.
- One source for CORS and cookie-auth origins.
- Client memory provider, REST/socket renewal, coordinated account actions and
  stable UI lifetimes, all still opt-in.

Still required before switching the live app:

1. Choose the deployment origin arrangement. The current cookie is
   `SameSite=Strict` and the guard rejects `Sec-Fetch-Site: cross-site`. An unrelated
   frontend host and API host will not work merely because both appear in CORS.
   Use a deliberately same-site HTTPS arrangement or same-origin API proxy.
   For local tests, keep the hostname consistent; do not mix localhost and
   127.0.0.1 across the frontend/API URLs.
2. Switch `server/src/index.js` to explicit refresh-enabled app construction and
   `client/src/main.jsx` to `AuthProvider mode="memory"` together.
3. Remove the legacy stored access token and reject marker-free legacy JWTs in
   the shared verifier used by REST and sockets. Existing sessions should sign in
   again; do not silently import old credentials into memory mode.
4. Exercise the real browser: login/signup, reload restoration, concurrent REST
   and socket expiry, reconnect/rejoin, drafts, logout, password/deletion,
   multiple tabs and ambiguous refresh failures.
5. Verify production cookie flags, exact origins, proxy trust, secrets and
   dependency/security checks before deployment.

Do not expose a request-controlled mode switch or loosen cookie security to make
an incompatible deployment topology appear to work.

## Verification Scope

`authSessionIntegration.test.js` now constructs the full Express app instead of
mounting an isolated auth router. It uses an ephemeral database and real local
Socket.IO connections for session issuance, rotation and revocation checks.

`appRefreshConfig.test.js` covers origin consistency, credentialed preflight,
untrusted-origin rejection, local HTTP restrictions, invalid construction options,
and unchanged legacy defaults.

Supertest does not enforce browser cookie/SameSite behavior. These server tests
are necessary, but do not replace the browser checks above.
