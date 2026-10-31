# Password recovery: token foundation

## Current scope

This iteration adds internal storage and token services only. There are no new
HTTP endpoints, reset emails, forms, password changes, or automatic logins yet.
Existing authentication behavior is unchanged. Public signup remains gated on
completed recovery, verification, and reliable email delivery.

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

## Integration requirements for the next slice

Consumption is not password reset completion. The future writer must validate the
new password before consumption, then conditionally update the account matching
the claimed session version and atomically increment that version with the new
password hash. A plain `findByIdAndUpdate` would permit a stale claimant to race a
password change or revocation. The final write must guard against that race.

A failure after consumption burns the token; the user must request a fresh link.
Do not restore the token on failure. Successful reset must invalidate existing
refresh/access sessions and live sockets using the existing revocation machinery.

Before exposing this service publicly, add:

- Rate-limited request/completion endpoints and generic request responses that do
  not reveal account existence, including careful timing and failure handling.
- Delivery only to the stored account address; never a client-selected recipient.
- HTTPS reset links from trusted server configuration, not request Host headers.
- POST-only completion; opening a link must not consume it (email scanners open links).
- No token logging, analytics capture, or referrer leakage; no-store responses.
- End-to-end race tests for password writes, reset requests and session revocation.
- A separate email-verification design; these tokens are not interchangeable.

Reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Verification

```sh
npm --prefix server test -- src/__tests__/passwordResetTokens.test.js src/__tests__/passwordSessions.test.js
```

Tests use disposable MongoDB and fake users, with no private environment files or
provider calls. Comments explain the security invariant behind each group.
