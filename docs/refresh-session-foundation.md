# Refresh Session Foundation

Status: internal server foundation only. Login, JWT lifetime, browser storage,
REST authentication and Socket.IO behavior are unchanged. No endpoint imports
this service yet, and no refresh cookies are issued.

## Code Map

- `server/src/models/RefreshSession.js`: one document per browser login family,
  captured account version, token digests, absolute expiry and revocation state.
- `server/src/services/refreshSessionService.js`: credential generation, account
  checks, atomic rotation and replay handling. No HTTP or socket dependencies.
- `server/src/__tests__/refreshSessions.test.js`: disposable MongoDB tests using
  real writes, including concurrent rotation and revocation races.

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

Next: cookie/CSRF policy, refresh throttling, refresh/logout endpoints, and family
validation/socket eviction, split further as needed. Account deletion must clean
up these records. Client refresh coordination and the intentional legacy-token
cutover remain later steps. Do not connect issuance to live login prematurely.

Run `npm test -- src/__tests__/refreshSessions.test.js` from `server` for focused
coverage, or `npm test` for all server tests. No browser UI changes are expected
in this chunk. The [design review](token-lifecycle-design.md) documents the wider
rollout and deployment requirements.
