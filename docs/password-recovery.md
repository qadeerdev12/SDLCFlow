# Password recovery backend

## Current scope

Token storage, reset completion, and opt-in request/email delivery are implemented.
The Forgot Password and Reset Password pages are implemented. Delivery still
defaults off until explicitly enabled for controlled testing. Completion never
logs the user in automatically. Public signup remains gated on verified live
recovery, email verification, and reliable email delivery.

## Recovery pages

Login links to `/forgot-password`, a public page with an email form and generic
acknowledgement. It handles unavailable delivery, network failure and rate limits
without automatically retrying. Acknowledgement does not claim mail delivery.

Mail opens `/reset-password#token=...`. Bootstrap validates a single 64-character
hex token, scrubs query/fragment with history replacement before BrowserRouter
mounts, and hands the secret to page memory. React StrictMode replay does not
consume it. Client-side route entry is also scrubbed. The bootstrap copy is cleared
once mounted; no token is written to storage or included in navigation state.
Reloading the scrubbed page requires reopening the email link (if still valid)
or requesting a fresh link. Query-string tokens are not accepted. The HTML sets
`Referrer-Policy` through a no-referrer meta tag as well as production HTTP policy.

The form validates the shared password policy and matching confirmation before
submitting. Opening a link makes no completion request. Duplicate submissions
are blocked. Reset completion uses the existing Web Locks/BroadcastChannel auth
coordinator because it clears the refresh cookie, even for signed-out visitors.
No bearer token is required. Success clears session state, notifies other tabs
without sharing secrets, removes password/token state and offers a login link.

Only validation, CSRF and throttling errors retain the link for manual retry;
password fields are cleared after a request. Expired/spent links, conflicts and
ambiguous responses remove the secret and offer a new link. There is no automatic
retry after token consumption or lost responses. Required browser coordination
capabilities remain the same as normal login.

## Request endpoint and delivery

`POST /api/v1/auth/forgot-password` accepts `{ email }`, with configured Origin,
`X-SDLCFlow-CSRF: 1`, and JSON (1 KB maximum). Invalid email/body input returns
400; disallowed browser requests return 403. Five attempts per IP per 15 minutes
are allowed, before parsing. Further attempts return 429 with Retry-After.

With delivery disabled, all valid emails receive `503 PASSWORD_RECOVERY_UNAVAILABLE`.
With delivery enabled, all valid emails receive the same no-store 202 response:

```json
{"data":{"message":"If an account exists for that email, a password reset link may be sent. Check your inbox and spam folder."}}
```

No account identity, token, cookie, or provider status is returned. User lookup
and sending occur after acknowledgement, outside response handling, so response
latency does not wait on account existence or the provider. This reduces timing
enumeration; it is not a claim of cryptographic constant-time HTTP behavior.

The handler's per-app admission controls run before any user lookup:

- At most four active jobs; additional requests are acknowledged but not queued.
- At most twenty admitted requests per one-hour window from process/window start.
- One admitted request per normalized email per fifteen minutes. Only an email
  digest and expiry are retained in the cooldown map, which is bounded by admission.
- Unknown accounts and failures count too. Suppression uses the same 202 response.

The request's recipient is resolved from stored account data. Client-supplied
recipient or URL fields are ignored. Brevo gets a plain-text message with a fixed
subject and a trusted `/reset-password#token=...` URL. HTTPS origin validation
prevents Host-header poisoning and open redirects. The sender uses a ten-second
timeout, rejects redirects, and never retries an ambiguous send automatically.
After a timeout, an issued token may remain valid because the mail may have been
accepted; the next admitted request replaces it.

Background errors log only a fixed warning, not submitted email, token, URL,
provider body, or key. Work is tracked by the server lifecycle so graceful shutdown
waits before disconnecting MongoDB (subject to its existing overall deadline).

These are best-effort in-memory controls for a single-instance demo, not a durable
queue or distributed rate limiter. Crashes can drop accepted requests, restarts
reset quotas, and multiple instances multiply the limits. Attackers can exhaust
the global allowance or temporarily suppress a known recipient; account login
remains unaffected. Before scaling or wider public use, revisit durable dispatch,
shared quotas, and operational monitoring. A 202 is not a delivery guarantee.

See [email delivery](email-delivery.md) for opt-in configuration, IP restrictions,
spam placement, and provider tracking/retention review.

## Lifecycle

1. The request handler resolves the account using its stored email and calls
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

Before enabling the full public recovery flow, complete:

- Live delivery/UI checks, including concurrent reset requests and sender tracking review.
- A separate email-verification design; these tokens are not interchangeable.

Reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Verification

```sh
npm --prefix server test -- src/__tests__/passwordResetTokens.test.js src/__tests__/passwordResetCompletion.test.js src/__tests__/passwordSessions.test.js src/__tests__/socketSessions.test.js src/__tests__/authRateLimit.test.js --maxWorkers=2
npm --prefix server test -- src/__tests__/forgotPassword.test.js src/__tests__/passwordRecoveryConfig.test.js src/__tests__/passwordRecoveryEmail.test.js
```

Tests use disposable MongoDB and fake users, with no private environment files or
provider calls. Comments explain the security invariant behind each group.

Client verification:

```sh
npm --prefix client test
npm run lint
npm run build
```

With Vite running on port 5180, run the mocked browser journey:

```sh
PLAYWRIGHT_CHANNEL=chrome node server/scripts/check-recovery-ui.mjs http://127.0.0.1:5180
```

This uses installed Chrome in an isolated browser context, intercepts all API calls
and uses fake tokens only. Omit PLAYWRIGHT_CHANNEL to use an installed Playwright
Chromium. It checks desktop/mobile layouts, login navigation, URL scrubbing,
success, expired links, reload behavior and secret-free browser storage.
Screenshots are written to `/private/tmp/sdlcflow-recovery-ui`. This is not proof
of live Brevo delivery, production HTTPS behavior, or cross-browser compatibility.
