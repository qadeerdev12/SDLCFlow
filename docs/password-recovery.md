# Password recovery backend

## Current scope

Internal token storage and the POST reset-completion endpoint are implemented.
There is no public token-request endpoint, reset email delivery, or recovery UI
yet. Completion never logs the user in automatically. Public signup remains gated
on completed recovery, verification, and reliable email delivery.

## Lifecycle

1. A future request handler resolves the account using its stored email and calls
   `issuePasswordResetToken(userId)` internally.
2. The service creates 32 cryptographically random bytes (64 hex characters),
   stores only a SHA-256 digest, the account's session version, and a 15-minute
   expiry. The raw token is returned once for delivery, never for logging or a
   public API response. SHA-256 is appropriate here because the secret is random,
   not a human-chosen password; passwords continue to require bcrypt.
3. A unique user index bounds storage to one pending reset per account. The last
   persisted issuance replaces previous tokens; concurrent emails can arrive out
   of order. Issuance alone never changes passwords or revokes sessions.
4. `consumePasswordResetToken(token)` validates the input shape, then atomically
   deletes a matching, unexpired digest. Only one concurrent claimant succeeds.
5. The service rejects deleted accounts or mismatched session versions. It returns
   `{ userId, sessionVersion }` on success and `null` for invalid claims. Storage
   errors propagate; callers must not interpret them as success.

MongoDB TTL removes expired rows eventually. The consumption query checks expiry
itself, including rejecting the exact expiry boundary. TTL timing is never a
security boundary. Deleted accounts cannot claim a token; pending orphan rows
expire automatically. Legacy accounts without a session version use generation 0.

## Completion endpoint

`POST /api/v1/auth/reset-password` accepts `{ token, newPassword }` without an
access token. It requires the configured Origin, `X-SDLCFlow-CSRF: 1`, and JSON,
matching other authentication actions. It accepts at most 4 KB of JSON. A separate
per-IP budget allows 10 attempts per 15 minutes, including successful attempts,
before parsing, database lookup, or bcrypt. Counters are per process, not shared
between replicas; initial deployment remains single-instance.

The controller validates the password (15 characters minimum, 72 UTF-8 bytes
maximum, never trimmed) before consuming the token. It then hashes with bcrypt
cost 10 and conditionally updates the account matching the claimed session
version. Password replacement and the version increment are one atomic write.
A racing reset, password change, deletion, or logout-all cannot be overwritten.

Success is `200 { data: { updated: true } }`, with no access token. Old access and
refresh credentials fail the account-generation checks, and older live/pending
sockets are revoked. Newer login families are not removed. The caller's refresh
cookie is cleared; the user must sign in again. Refresh rows can remain until TTL
cleanup; their old generation is no longer authorized.

Errors: `400 VALIDATION` for password/body errors, `400 PASSWORD_RESET_INVALID`
for malformed, expired, spent, revoked or unknown claims, `409 PASSWORD_RESET_CONFLICT`
for a lost account-write race, `403 CSRF_REJECTED` for browser-policy failures,
`413 VALIDATION` for oversized JSON, `429 AUTH_RATE_LIMITED` with Retry-After, and
generic `500 INTERNAL_SERVER_ERROR` for storage/hash failures. All auth responses
are no-store; raw tokens/passwords/provider errors are not logged.

A failure after consumption burns the token; the user must request a fresh link.
Do not restore the token on failure. Invalid new passwords do not consume tokens.
GET has no completion handler, so opening links cannot reset passwords.

## Remaining integration

Before enabling the full public recovery flow, add:

- A rate-limited request endpoint and generic request responses that do
  not reveal account existence, including careful timing and failure handling.
- Delivery only to the stored account address; never a client-selected recipient.
- HTTPS reset links from trusted server configuration, not request Host headers.
- Forms that avoid token analytics capture and referrer leakage.
- End-to-end delivery/UI tests, including concurrent reset requests.
- A separate email-verification design; these tokens are not interchangeable.

Reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Verification

```sh
npm --prefix server test -- src/__tests__/passwordResetTokens.test.js src/__tests__/passwordResetCompletion.test.js src/__tests__/passwordSessions.test.js src/__tests__/socketSessions.test.js src/__tests__/authRateLimit.test.js --maxWorkers=2
```

Tests use disposable MongoDB and fake users, with no private environment files or
provider calls. Comments explain the security invariant behind each group.
