# Active Authentication and Cutover

Status: memory-only access tokens and rotating refresh cookies are now the default
in source. Restart/rebuild both processes to activate this change. Automated tests
cover the cutover. The isolated Chrome check now covers login/signup, reload
restoration, local cookie/storage behavior, restoration failures, expiry-driven
REST/socket renewal, rejoin/refetch, chat draft retention, multi-tab coordination
and account-action revocation. The planned local browser checks are complete;
production HTTPS and other browser engines remain unverified.
Older authentication guides describe staged implementation history; this file
supersedes their references to dormant routes, opt-in providers or legacy tokens.

## What Changed

- `client/src/main.jsx` explicitly mounts memory authentication; `AuthContext.jsx`
  has no legacy provider. Unknown/retired modes throw.
- Provider startup removes only `localStorage.token`, never reads its value, and
  never imports it. Other preferences and non-secret coordination metadata remain.
  If removal fails, no authentication request is sent; enable storage and reload.
- Restore uses the HttpOnly cookie. An existing user with only an old token must
  sign in again. Account documents, projects and passwords are not migrated.
- `authRuntimeOptions` chooses cookie transport from the server process environment.
  The app factory always mounts cookie guards; `refresh: null` cannot disable them.
- Login/signup always create a stored refresh family and issue a short-lived access
  JWT plus refresh cookie. Missing security wiring fails closed, not into legacy issuance.
- The shared REST/Socket.IO verifier requires every family, purpose, issuer,
  audience, version and timing claim. Marker-free seven-day JWTs fail even with a
  valid signature. The old token-issuance helper has been removed.
- Cookie-changing actions are available through the auth provider/coordinator,
  not through the generic bearer API wrapper.

Access JWTs last at most 15 minutes and cannot outlive their refresh family.
Refresh families expire absolutely after seven days. Logout revokes the current
family; password changes/logout-all invalidate the account's previous sessions.
No database reset, secret rotation or production deployment is performed here.

## Starting Locally

Use the same hostname for both applications. The configured local layout is
frontend `http://localhost:5173`, API `http://localhost:5050/api/v1`, and Socket.IO
origin `http://localhost:5050`.

```sh
# In server/
npm run check:auth-config -- --local
npm run dev

# In client/
npm run dev
```

The server dev command explicitly sets NODE_ENV=development. Development/test
allow the non-Secure dev cookie only for loopback origins. No .env secrets are
changed. Reload old tabs after restarting; an already-open pre-cutover bundle
does not become secure merely because new source exists on disk.

## Production Startup

The selected deployment topology is one persistent web service for the frontend,
API and sockets. See [First Deployment Plan](deployment-plan.md) for its public
URL contract and unimplemented hosting/static-serving prerequisites.

`npm start` with no NODE_ENV defaults to production security. Set exact HTTPS
CLIENT_ORIGIN values; absent origins or HTTP origins fail before the server listens.
Only development, test and production are accepted environment names. A misspelled
name cannot silently enable insecure cookies.

Production uses `__Host-sdlcflow_refresh`, HttpOnly, Secure, SameSite=Strict and
Path=/, without Domain. The frontend and API need a reviewed same-site layout;
the preflight currently approves only same-host layouts. Proxy configuration,
domain selection and production deployment remain separate work.

## Test Migration and Review Map

The default server tests now use real persisted refresh families rather than
forging legacy JWTs. `server/src/__tests__/helpers/auth.js` supplies browser-style
Origin, JSON and CSRF headers to controller/resource tests. Security-boundary
tests still use raw Supertest, so missing/forged-header rejection is not hidden.
No production verifier bypass or test-only legacy acceptance was added.

Review core files:

- [Runtime options](../server/src/config/authRuntime.js), [app factory](../server/src/app.js),
  [entry point](../server/src/index.js), [auth router](../server/src/routes/authRoutes.js).
- [Issuance](../server/src/services/authSessionService.js),
  [shared JWT verifier](../server/src/utils/accessTokens.js),
  [stored version handling](../server/src/utils/sessionTokens.js).
- [Client entry](../client/src/main.jsx), [provider boundary](../client/src/context/AuthContext.jsx),
  [memory provider](../client/src/context/MemoryAuthProvider.jsx),
  [bearer API](../client/src/lib/api.js), [coordinator](../client/src/lib/refreshCoordinator.js).
- [Runtime tests](../server/src/__tests__/authRuntime.test.js),
  [REST/socket rejection tests](../server/src/__tests__/accessSessions.test.js),
  [full-app integration](../server/src/__tests__/authSessionIntegration.test.js),
  [client default](../client/src/__tests__/authSession.test.jsx),
  [storage removal](../client/src/__tests__/memoryAuth.test.jsx).

## Browser Verification

Chunks 1-4 passed against the real client and API with a disposable database. Run
`npm run test:auth-browser` from `server/`. For setup, exact coverage and remaining
limitations, see [the browser verification guide](authentication-browser-verification.md).

Logout, logout-all, password changes and account deletion are now covered,
including their effects on independent sessions and old REST/socket credentials.
Production HTTPS, proxy routing and broader browser coverage remain separate work.

For additional manual verification, use disposable accounts for destructive tests.
Check login/signup, page reload,
cookie flags, absence of stored bearer tokens, REST/socket expiry, rejoin/refetch,
draft retention, multiple tabs, logout, password change and account deletion.
Also test blocked storage, temporary auth outages and lost refresh responses.
An uncertain refresh must require sign-in, not blindly replay rotation.

Unit tests alone are not proof of browser cookie behavior. The local browser
runner verifies the development cookie only, not production HTTPS routing.
