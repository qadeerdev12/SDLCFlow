# Refresh Session Foundation

Status: internal server foundation and cookie/CSRF helpers only. Login, JWT lifetime, browser storage,
REST authentication and Socket.IO behavior are unchanged. No endpoint imports
this service yet, and no refresh cookies are issued.

## Code Map

- `server/src/models/RefreshSession.js`: one document per browser login family,
  captured account version, token digests, absolute expiry and revocation state.
- `server/src/services/refreshSessionService.js`: credential generation, account
  checks, atomic rotation and replay handling. No HTTP or socket dependencies.
- `server/src/__tests__/refreshSessions.test.js`: disposable MongoDB tests using
  real writes, including concurrent rotation and revocation races.
- `server/src/middleware/refreshSecurity.js`: strict origin/header guard and
  matching cookie set/clear helpers, not mounted on live routes yet.
- `server/src/__tests__/refreshSecurity.test.js`: isolated HTTP tests for cookie
  flags, rejected requests, configuration validation, and credentialed CORS.

## Credential Lifecycle

`createRefreshSession(user)` is an internal issuance boundary, not a login
method. Its future caller must first verify credentials and select the user's
session version. It returns a raw credential once, plus session/user IDs,
captured version and absolute expiry. The credential is an ObjectId selector,
a dot, and a cryptographically random 32-byte base64url secret. Only a SHA-256
digest of the complete credential is stored. Never log the returned object or
serialize it into an ordinary API response; the credential belongs in a cookie.

`rotateRefreshSession(credential)` checks the credential shape, active family,
user existence and account version. A single conditional database update swaps
the digest, appends the consumed digest, and increments the rotation count.
The absolute seven-day expiry and original account version never change.
TTL cleanup is not relied on for authorization.

Every consumed digest is retained until deletion. A known consumed credential
revokes that family; a guessed secret cannot revoke it using a known selector.
Two simultaneous refreshes using one credential have at most one success, and
the losing replay revokes the family, including the winner's replacement.
Cross-tab serialization is therefore required before enabling HTTP refresh.

The cap is 2,048 rotations per family. At 15-minute renewal intervals, a
continuously active seven-day session uses about 672 rotations. The cap leaves
room for reloads/multiple tabs while bounding document growth. At the cap, a
valid current credential revokes the family and requires sign-in; history is
never truncated. This lifetime cap is not a substitute for endpoint rate limits.

## Failure Contract

- `REFRESH_INVALID` (401): malformed, unknown, expired or revoked credential,
  deleted account, changed account version, or unmatched secret.
- `REFRESH_REUSED` (401): a consumed credential matched and revoked its family.
- `REFRESH_EXHAUSTED` (401): a current credential reached the rotation cap.
- Database failures propagate, rather than masquerading as authentication failure.

Replay/exhaustion errors carry an internal `sessionId` for future socket eviction.
They contain no credential. Existing sockets are not affected by this isolated
service yet. A write committed before a lost response cannot safely be undone;
do not blindly retry a consumed credential.

If account-wide revocation races rotation, the result retains its old version.
Later access-token issuance must use that captured version, never read and copy
the new account version. REST and socket validators must enforce both account
version and family validity before this flow is enabled.

## Next Slice and Verification

Next: refresh throttling, refresh/logout endpoints, and family
validation/socket eviction, split further as needed. Account deletion must clean
up these records. Client refresh coordination and the intentional legacy-token
cutover remain later steps. Do not connect issuance to live login prematurely.

Run `npm test -- src/__tests__/refreshSessions.test.js` from `server` for focused
coverage, or `npm test` for all server tests. No browser UI changes are expected
in this chunk. The [design review](token-lifecycle-design.md) documents the wider
rollout and deployment requirements.

## Chunk 3: Cookie and CSRF Boundary

`createRefreshSecurity({ origins, localHttp, environment })` returns a request
guard, cookie setter/clearer, and cookie name. Configure it once with the same
explicit origins used by credentialed CORS. It deliberately does not read a
second origin environment variable or modify the existing routes.

Default cookies are `__Host-sdlcflow_refresh` with HttpOnly, Secure,
SameSite=Strict, Path=/, and no Domain. The setter uses the refresh family's
absolute expiry, not a renewed seven-day duration. The clearer uses the same
name/path/security options. Expired credentials and malformed arguments fail
before writing headers. These settings follow the
[MDN cookie attribute contract](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

HTTP development must explicitly pass `localHttp: true` and environment
`development` or `test`. All configured origins must then be loopback hosts.
That mode uses `sdlcflow_refresh_dev` without Secure. Unknown environments and
production cannot enable it. Default mode requires exact HTTPS origins with no
paths, credentials, wildcard hosts, or trailing slashes. A same-site production
domain layout is still required; origin validation does not prove site ownership
or browser cookie compatibility.

For future cookie-setting/authenticated mutation routes, mount CORS first, then
rate limiting and this guard, then JSON parsing and the controller. Preflight is
handled by CORS, not by the mutation guard. The client must send:

- An allowed `Origin` (normally supplied by the browser).
- `Content-Type: application/json` and a JSON body, including `{}` for logout.
- `X-SDLCFlow-CSRF: 1` and fetch `credentials: 'include'`.

The custom header is not a secret or an authentication token. Requiring it makes
cross-origin browser requests preflight; the server also validates the exact
origin. This follows [OWASP's custom-header approach](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
Missing/null/untrusted origins, incorrect headers and non-JSON requests return
403 `CSRF_REJECTED` before parsing or changing auth state. When supplied,
`Sec-Fetch-Site` must be `same-origin` or `same-site`; missing metadata is allowed
for compatibility because the other checks are mandatory. All guarded responses
and cookie writes use `Cache-Control: no-store`.

Do not mount this on GitHub's OAuth callback, which has its separate state
validation, or indiscriminately on bearer-only resource routes. No new environment
settings or client changes are required yet. Existing sign-in requests will not
satisfy this contract until the coordinated client/server integration slice.

Run `npm test -- src/__tests__/refreshSecurity.test.js` in `server` for this
boundary. Tests verify real HTTP headers using a test-only router, not browser
cookie acceptance; Chrome/Firefox/Safari checks on the actual deployment remain
part of the later integration gate.
