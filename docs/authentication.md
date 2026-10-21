# Authentication Hardening

> Historical implementation guide. The coordinated cutover is now active in source.
> For current startup, token policy and verification status, see
> [Active Authentication and Cutover](authentication-cutover.md). Earlier opt-in
> and legacy-default statements below describe the pre-cutover stages only.

## Decision

SDLCFlow will retain self-managed JWT authentication. Supabase Auth migration is
not part of the launch plan. This is a learning and ownership decision, not a
claim that custom authentication is inherently safer than a managed provider.
Use maintained cryptographic libraries, not custom cryptography.

## Slice 1: Input Validation

`server/src/utils/authValidation.js` is the authoritative input boundary used by
registration, login, profile updates, password changes, and account deletion.
Inputs are validated before reaching database filters or password hashing.

| Field | Rule |
| --- | --- |
| Request body | Non-null JSON object, not an array |
| Name | String, at most 100 UTF-16 code units before trimming; non-empty after trimming |
| Email | String, at most 254 UTF-16 code units before trimming; basic address syntax; trimmed and lowercased |
| New password | At least 15 Unicode code points and at most 72 UTF-8 bytes |
| Existing password | Non-empty string, at most 1024 UTF-8 bytes |

The email check validates syntax, not ownership or deliverability. Typed email
validation prevents objects such as `{ "$ne": null }` from becoming query
selectors. Duplicate email conflicts, including unique-index races, return 409.
Other validation failures return 400 with the existing `VALIDATION` error code.

Passwords are never trimmed or normalized. Spaces and Unicode are allowed, with
no required mixture of uppercase, numbers, or symbols. The minimum follows
[OWASP's guidance for accounts without MFA](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls).
The byte maximum avoids [bcrypt's silent truncation beyond 72 bytes](https://github.com/dcodeIO/bcrypt.js#security-considerations).
This bcrypt constraint limits non-ASCII passphrase length; changing the hashing
algorithm or introducing a hash migration is a separate decision.

Login, current-password confirmation, and account deletion deliberately do not
apply the new-password minimum. Existing short passwords continue to work.
Legacy passwords over 72 bytes remain verifiable up to the 1024-byte request
limit, with bcrypt's original truncation semantics. Previously accepted passwords
over 1024 bytes are no longer accepted; recovery support remains a launch blocker.
No existing hashes or accounts are rewritten by this slice.

`client/src/lib/passwordPolicy.js` mirrors the new-password rules for immediate
feedback in registration and profile forms. The server still enforces every rule
for API callers that bypass the UI. Keep both helpers and their boundary tests in
sync when changing the policy. Do not use HTML character limits as a substitute
for UTF-8 byte validation.

Registration no longer logs its response/token. Mutation and login errors log
only fixed operation descriptions, not raw database errors or submitted values.

## Slice 2: Login and Signup Throttling

`server/src/middleware/authRateLimit.js` uses
[express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
with independent IP budgets: 20 login requests per 15 minutes and 10 registration
requests per hour. Successful and failed requests both count. The auth router
runs these guards before JSON parsing, database queries, and bcrypt. Each app
instance owns its limiters; unrelated routes do not consume these budgets.

The library's default key groups IPv6 addresses by /56 to resist trivial address
rotation. Changing the submitted email does not reset an IP's budget. A blocked
request returns HTTP 429, `AUTH_RATE_LIMITED`, a user-facing message, `retryAfter`
seconds, and `resetAt`. Responses include rate-limit headers and `Retry-After`.
The existing client API wrapper preserves the metadata and the auth forms show
the message. There are no automatic retries or account-existence hints.

### Deployment and Proxy Trust

Direct/local access defaults to `trust proxy: false`. Leave
`TRUSTED_PROXY_CIDRS` empty unless the server actually sits behind a proxy.
For deployment, set a comma-separated list of verified proxy IP addresses/CIDRs.
The configuration rejects blanket `true`, hop counts, invalid addresses, and
zero-prefix networks. Only include networks controlled by your infrastructure;
a valid but overly broad CIDR is still unsafe. Do not guess a hosting provider's
proxy range or trust every private network automatically.

[Express resolves the nearest untrusted address](https://expressjs.com/en/guide/behind-proxies/)
from the socket and forwarding chain. Untrusted direct callers cannot rotate
`X-Forwarded-For` to get new quotas. Confirm in staging that different real clients
get separate budgets, same clients share a budget, and forged headers are ignored.
The proxy must sanitize forwarding headers, and direct origin access should be
restricted. Until configured correctly, all visitors behind an untrusted proxy
may share one quota. Resolve the existing proxy dependency advisory before
enabling trusted proxies for public deployment.

### Limitations

Counters are in memory, expire automatically, and reset on server restart.
Multiple server processes do not share quotas. Use a shared store and edge
controls before scaling; this is not distributed brute-force or DDoS protection.
IP-only limits do not stop attacks from many different IPs, and users sharing a
network share a budget. Account-aware risk controls and threshold tuning need
deployment review without introducing easy account-lockout attacks. Password
changes and other authenticated mutations are outside this slice.

## Slice 3, Chunk 1: Session-Version Foundation

Users now have an internal `sessionVersion`, initially zero. Registration and
login issue a signed JWT containing the user's ID and the current version.
`protect` loads that version from MongoDB on every protected REST request and
compares it with the token. A mismatch returns HTTP 401 with `SESSION_INVALIDATED`.
This provides a revocation mechanism without keeping a list of individual tokens.

The version must be a non-negative safe integer. Malformed token versions and
IDs return `INVALID_TOKEN`; malformed stored versions fail closed. Expiration,
signature verification, and missing-account checks still apply. New token
issuance lives in `server/src/utils/sessionTokens.js` so future authentication
flows can use the same claims and compatibility rules.

### Compatibility and Ownership

Reading order for maintainers: `models/User.js` defines the counter;
`utils/sessionTokens.js` defines normalization and token issuance;
`controllers/authController.js` calls issuance after credential verification;
`middleware/auth.js` checks the counter on each protected REST request.
`__tests__/sessionTokens.test.js` demonstrates compatibility and rejection cases.

Existing database documents without the field are read as version zero, without
a bulk migration. Existing signed tokens without the claim are also treated as
zero, but only match an account still at zero. Once a future revocation action
increments the stored version, both legacy and versioned zero tokens stop passing
REST authentication. Never reset the counter to zero or decrease it: that could
make an old token usable again.

The field is excluded from ordinary user queries and public auth response data.
Login and REST middleware explicitly select it. Any future flow signing tokens
from a queried user must also select `+sessionVersion`; token issuance throws
when that value is absent. Mongoose supplies the zero default for legacy documents
when the field is selected. Registration and profile updates
ignore client-supplied session versions. Only server-owned revocation operations
should update it, using an atomic increment.

### Deliberate Boundaries

Chunk 1 introduced the comparison mechanism only. Chunk 2 adds the first
production increment, and chunk 3 enforces it for live connections. An
already-authorized operation can still finish if revocation happens after its
authorization check; revocation does not cancel in-flight database writes.

## Slice 3, Chunk 2: Password-Change Revocation

`PATCH /api/v1/auth/password` still requires a valid session, the current password,
and a new password meeting the policy. It now replaces the hash and increments
`sessionVersion` in one atomic database update. Once committed, previously issued
tokens fail subsequent protected REST requests, including the caller's token.
Login with the new password issues a token at the new version.

The update matches both the verified password hash and version. This
compare-and-swap prevents an overlapping password change or revocation from
being overwritten after the initial read. Only one competing change can commit;
a request whose snapshot no longer matches returns 409 `PASSWORD_CHANGE_CONFLICT`.
See [Mongoose's atomic update documentation](https://mongoosejs.com/docs/tutorials/findoneandupdate.html#atomic-updates).
The hash and version are never written separately. Legacy documents without a
counter match version zero, and `$inc` creates their counter at one. The safe
integer boundary is checked explicitly because update validators do not validate
`$inc`. Do not replace this operation with a read/modify/save sequence.

Validation errors and incorrect current passwords do not mutate either field.
A failed database write does not partially update the document. If a response is
lost after a successful write, the client may see an error despite the change
having committed; retrying the old token fails, and the user should sign in with
the new password. The response stays `{ data: { updated: true } }` and does not
include a replacement token.

`ProfilePage.jsx` clears local authentication and redirects the changing tab to
login after success. Failures keep the form open and show the server error.
Chunk 3 below adds proactive socket disconnection and invalid-session handling
for other tabs. Ordinary logout still does not increment the server counter.

## Slice 3, Chunk 3: Live Sessions and Client Invalidation

`services/socketSessionService.js` owns the socket authentication lifecycle.
`socket.js` delegates to it before joining user/project rooms or registering
application handlers. Handshakes verify the JWT, validate its ID/version claims,
and compare the version with MongoDB. Every incoming application packet repeats
the account/version check before dispatch. Legacy version-zero compatibility
matches REST.

[Socket.IO connection middleware runs once per connection](https://socket.io/docs/v4/middlewares/),
so a successful handshake alone cannot enforce future revocation. The service
also tracks pending handshakes and connected sockets in a per-server registry.
Password changes call `revokeSocketSessions` after committing the version bump.
Only older versions for that account are ended; unrelated users and fresh logins
at the new version survive. Pending reads are marked revoked, then checked again
before authentication completes. Account deletion uses the same lifecycle with
`USER_NOT_FOUND` and no version cutoff.

Terminal sessions receive `session:invalidated` with a code, then the server
disconnects them. Disconnect removes user/project rooms and runs existing
presence/typing cleanup. This does not rely on the client honoring the notice.
An expiry timer also disconnects idle sockets at their JWT's `exp`, including
read-only viewers. Timers and registry entries are cleaned up on disconnect or
transport close. Legacy signed tokens without `exp` retain their existing
behavior; all tokens issued by the app have the seven-day expiration.

Database failures return `AUTH_UNAVAILABLE`, not a false claim of invalid
credentials. An affected packet is not dispatched. A refused handshake gets a
bounded-backoff client retry (3 seconds initially, at most 30 seconds); network
reconnect behavior otherwise remains Socket.IO's responsibility.

### Client Flow

`lib/sessionEvents.js` is the in-memory bridge from REST/socket errors to
`AuthContext`. Only explicit terminal session codes clear authentication, not
wrong-password errors, permissions, throttling, or temporary failures. Each signal
includes the token used by the failed request. The provider compares it with the
current token before clearing state, preventing a late response from ending a
newer login. Never log or persist these events because they contain credentials.

The provider clears both user and token, and protected routes return to login
with a session-ended message. Late `/me` responses cannot restore a signed-out
user. Cross-tab storage events clear old state or validate a new token. Initial
session-validation outages retain the token and show a retry action instead of
silently discarding credentials. `useSocket` stops invalid-token reconnects,
cleans up listeners/retry timers, and reports terminal acknowledgement errors.
The password-change page targets its original token when clearing local state,
so a delayed success response cannot erase a newer login.

### Deployment Limits

Immediate eviction and pending-handshake protection cover this single server
process. Multiple servers require coordinated revocation and a shared adapter;
per-packet database checks alone do not evict idle viewers on another instance.
Out-of-band database edits also do not proactively evict idle sockets: server
revocation actions must call the lifecycle helper after persistence. Already
delivered data cannot be retracted, and operations authorized before revocation
may finish. No token-storage/refresh migration is included here.

## Slice 3, Chunk 4: Log Out Everywhere

The profile page's Security section now offers **Log out everywhere**, using the
existing confirmation dialog. It explains that the current browser is included
and that passwords/projects are unchanged. Cancel makes no request; while the
request is pending, confirmation and cancellation are disabled. A synchronous
guard prevents duplicate submissions before React rerenders.

`POST /api/v1/auth/logout-all` requires a valid bearer token through `protect`.
The account ID and expected session version come exclusively from `req.user`;
submitted account IDs or versions are ignored. No additional password is required:
this is self-service revocation by an already authenticated account, not an admin
endpoint or a credential change.

The controller atomically increments only the caller's current version, including
the missing-field legacy-zero case. Its compare-and-swap condition means two
overlapping requests cannot increment twice, and an old request cannot invalidate
a fresh login created after the first revocation. A stale request receives 401
`SESSION_INVALIDATED`. On success, older live/pending sockets are revoked and the
response is `{ data: { loggedOut: true } }`. No replacement token is issued.

The client clears its original local session and returns to login on success;
socket notices may sign it out before the HTTP response arrives. A failed write
does not revoke sessions. Other nonterminal errors leave the profile usable with
an error and retry option. If the write committed but the response was lost,
the old token is still revoked; the user can sign in with their unchanged password.

This completes the four session-invalidation chunks for the current single-server
deployment. The ordinary navigation logout still clears browser-local state
(synchronized to same-origin tabs); only this action and password changes revoke
server-side session generations. This is account-wide revocation, not a device
list or a way to revoke one selected device. Single-process and in-flight-operation
limits described above still apply.

## Remaining Slices

1. Token storage, expiration, refresh, and associated CSRF/XSS protections.
   The [token lifecycle design review](token-lifecycle-design.md) proposes the
   next architecture. The [refresh-session foundation](refresh-session-foundation.md)
   implements storage, rotation, cookie/CSRF helpers, and REST/socket family
   validation, plus opt-in login/account-action integration. Refresh endpoints and client integration are not enabled in the live app; existing
   login still issues legacy tokens. See the foundation guide for compatibility
   behavior and the remaining cutover requirements.
2. Password recovery, email verification, and reauthentication for email changes.

JWTs currently still last seven days and the browser still stores them in
localStorage. Password changes and log out everywhere revoke old tokens for REST and live sockets on
the current server. Remaining launch blockers still prevent unrestricted public signup.

## Verification

Run `npm test` in both `server` and `client`, then `npm run lint` and
`npm run build` in `client`. Server tests use disposable MongoDB databases.
`authValidation.test.js` covers malformed fields, selector rejection, normalization,
duplicate races, password boundaries, legacy login, and password changes.
`passwordPolicy.test.js` covers matching browser policy boundaries.
Server `authRateLimit.test.js` covers quota boundaries, expiration, retry metadata,
controller bypass, separate route budgets, forged forwarding headers, proxy trust,
and IPv6 grouping. Client `authRateLimit.test.js` verifies retry metadata reaches
the UI without automatic retries. Tests use real middleware with mocked auth
controllers, not real accounts, for quota exhaustion.
`sessionTokens.test.js` covers token issuance, current-version checks, legacy
documents/tokens, invalid claims, expired/tampered tokens, deleted users, and
protection against client-written session state. It simulates a version increment
only in a disposable database; no real account needs manual modification.
`passwordSessions.test.js` checks real password-change revocation, legacy counters,
fresh login, rejected changes, database-write failure, and concurrent updates.
`profilePassword.test.jsx` checks redirect/local logout on success and preservation
of the form/session on failure.
`socketSessions.test.js` covers stale/malformed handshakes, multi-tab disconnection,
room cleanup, fresh-login survival, idle expiry, packet validation, pending
handshake races, and database outages. Client `authSession.test.jsx` and
`socketSession.test.jsx` cover terminal errors, network failures, stale responses,
cross-tab storage changes, listener cleanup, and retry cancellation.
`socketSessions.test.js` also verifies logout-all authentication, account isolation,
legacy counters, replay/concurrency protection, unchanged passwords, database-write
failure, fresh login, and live disconnection. `profileSessions.test.jsx` covers
confirmation/cancellation, duplicate-submit prevention, successful logout, and retry.

Manual review: register with a short password, then a valid passphrase; check that
an existing account still signs in; change its password in Profile; verify old
credentials fail and the new password succeeds. Check that registration does not
print the response or token in browser developer tools.

For chunk 2, sign in to a test account in two browser sessions. Change the password
in one: it should return to login with a success notice. Old credentials must fail
and the new password must work. A protected REST request with the other session's
old token should return 401 `SESSION_INVALIDATED`. The other session's connected
socket should now be disconnected and its UI should return to login. Try a
reconnect with the old token: the handshake should fail. Also try an incorrect
current password: the error should leave the current session usable. Briefly
stop the backend or go offline: network failures should not erase the token.

For chunk 4, sign into the same test account in two browsers, with a project or
notification connection open in each. In Profile, choose **Log out everywhere**.
Cancel first and confirm both sessions remain usable. Repeat and confirm: both
old sessions should end, while a different account remains signed in. Sign back
in with the same password and verify your projects are unchanged. Old-token REST
requests and socket reconnects must fail, without affecting that fresh login.
