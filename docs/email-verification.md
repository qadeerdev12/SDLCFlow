# Email verification

## Current scope

Verification state, one-time proof tokens, request/resend and confirmation endpoints,
and Brevo delivery are implemented, alongside the public verification page and
profile status/resend controls. Delivery still defaults off pending controlled
delivery checks. No restrictions on unverified accounts exist yet.
Existing signup, login, recovery, REST access and sockets
remain available under their current policies. Signup does not automatically send mail.

## Configuration

Use existing server-only `BREVO_API_KEY`, `EMAIL_FROM_NAME` and `EMAIL_FROM_ADDRESS`,
plus an independent delivery flag and trusted frontend origin:

```dotenv
EMAIL_VERIFICATION_ENABLED=false
EMAIL_VERIFICATION_ORIGIN=http://localhost:5173
```

Enable the flag deliberately for a controlled local delivery test. The origin must exactly
match an entry in `CLIENT_ORIGIN`, without trailing slash, credentials, path,
query or fragment. Production requires non-loopback HTTPS; local development/test
may use HTTP loopback. Enabled invalid configuration fails app startup and auth
preflight. Changing this flag does not enable/disable password recovery, public
signup or verification enforcement. No .env change is made by tests.

## Request and resend

`POST /api/v1/auth/verification/request` takes `{}` and requires a valid bearer
session plus the configured Origin, JSON and `X-SDLCFlow-CSRF: 1`. The server
ignores body-supplied recipients, user IDs and origins. Five attempts per IP per
fifteen minutes are allowed, before authentication queries or body parsing. JSON
is limited to 1 KB. Invalid auth/CSRF requests fail before scheduling mail.

With delivery disabled, authenticated valid requests return
`503 EMAIL_VERIFICATION_UNAVAILABLE`. With delivery enabled, all eligible requests
receive `202 { data: { message } }` with the fixed text:

> If your email needs verification, a link may be sent. Check your inbox and spam folder.

This acknowledgement does not mean delivery. The response is the same for already
verified accounts, cooldown/capacity suppression and eventual provider failures.
Work runs asynchronously, rechecks the login family and captured account generation,
then issues only for a currently unverified account. The recipient comes from the
issuance service's stored-address snapshot. The subject is `Verify your SDLCFlow email`,
with a trusted `/verify-email#token=...` link and a sixty-minute lifetime.

The shared dispatcher has separate counters per flow: maximum four active jobs,
twenty admissions per hour and a fifteen-minute per-account cooldown for verification.
Cooldown follows the account across email edits and sessions. Suppressed attempts
do not replace the pending link; admitted resends do. Already verified accounts and
delivery failures still consume admitted budget. Recovery retains its independent
twenty-per-hour allowance, so together the two flows can admit forty jobs/hour.

These are per-process, best-effort limits, not a durable/distributed queue. Crashes
can drop accepted work, restarts reset budgets and replicas multiply limits.
Shutdown tracks pending work before closing MongoDB, subject to its existing deadline.
Provider calls use one ten-second bounded request, no redirects and no automatic
retry. Raw provider errors, addresses and tokens are not logged. An uncertain send
can leave a valid pending token; don't delete/retry it blindly.

## Confirmation

`POST /api/v1/auth/verify-email` accepts `{ token }` with the configured Origin,
JSON and CSRF header but no login requirement. Its independent IP budget is ten
attempts per fifteen minutes, with a 1 KB body limit. Only explicit POST confirms;
GET does not consume a token. Existing links can be confirmed even when new mail
delivery is disabled.

Success: `200 { data: { verified: true } }`. It does not return the user's identity,
set/clear cookies, issue tokens, change passwords or revoke sessions. A logged-in
client can reload `/auth/me` to update its owner status; there is no automatic login.

Malformed, expired, spent, changed-address, deleted-account or revoked-generation
proof returns `400 EMAIL_VERIFICATION_INVALID`. Invalid JSON/body returns 400,
oversized JSON 413, origin/CSRF failure 403, and throttling 429 with Retry-After.
Unexpected storage failure returns a generic 500; failures after claim require a
fresh link. Responses are no-store, and errors never echo submitted token values.

## Account state

- `emailVerifiedAt`: null/absent means no proof. Only successful verification sets
  a timestamp. New accounts are not verified automatically.
- `emailVerificationVersion`: starts at zero and increments on each actual profile
  email change. A -> B -> A advances twice, so links for the original A stay invalid.
- Both raw fields remain hidden from default queries and API responses. Signup
  and profile input allowlists prevent clients from setting either field.
- Owner responses from register, login, `/auth/me`, `/auth/profile`, and profile
  updates now expose `emailVerified: boolean`. Other members' payloads do not gain
  this status. No generation counter or verification timestamp is exposed.

Old accounts without the fields are treated as unverified with email generation
zero. No bulk backfill, grandfathering, or real-account updates are performed.
This does not block old users; access policy will be introduced separately with
an explicit existing-user rollout plan.

## Token lifecycle

`issueEmailVerificationToken(userId)` reads the stored email and account state.
For an existing unverified account it creates 32 random bytes, returns the raw
64-character hex token plus its recipient and expiry, and stores only a SHA-256
digest in `EmailVerificationToken`. Delivery must use the returned stored email,
never a request-selected recipient. Do not log tokens or return them in public API
responses. Already verified or missing accounts return null; storage failures throw.

One pending row per user bounds storage. Successful new issuance supersedes older
links. Tokens expire after one hour; the final email copy must match this lifetime.
MongoDB TTL cleans rows eventually, but the consuming query checks expiry itself.
The token binds the user ID, exact normalized email, email generation and session
generation. Password changes/logout-all invalidate outstanding verification links
through the existing session counter; they do not undo completed email proof.

`completeEmailVerification(token)` rejects malformed input before database access,
atomically claims an unexpired digest with `findOneAndDelete`, then conditionally
sets `emailVerifiedAt` on the exact unverified account/address/generation snapshot.
Both generations are compared in the write, not a separate stale read. A deleted
account, email change, session revocation or already-verified account cannot pass.
It returns an internal `{ userId, emailVerifiedAt }` result or null; it does not
log in the caller, change credentials or issue/revoke sessions.

Claim and completion are separate operations. A crash or storage failure after
claiming burns the link and requires new issuance. Never restore spent tokens.
There is no GET consumer: explicit POST confirmation prevents email scanners from
performing the action just by opening a link.

Verification tokens and password-reset tokens have separate collections and
services. Neither token type can be used for the other purpose.

## Email changes

The existing profile endpoint still changes the email immediately in this slice.
An actual change atomically clears proof and increments the email generation with
the new address. Name-only edits and unchanged normalized email preserve proof.
Concurrent profile email updates compare the email/generation snapshot; a loser
receives `409 PROFILE_CHANGE_CONFLICT` rather than overwriting newer state.
Unique-email checks and indexes remain in effect.

All future code that changes `User.email` must preserve this invariant. A direct
database edit that bypasses the generation/proof reset is not a supported workflow.
Before public enforcement, replace immediate email changes with a reviewed flow
covering reauthentication, pending-address verification and notifications. Also
review reset-token invalidation across email changes. This foundation alone is
not a complete secure email-change workflow.

## Remaining slices

1. Test the complete verification flow locally with the configured sender, including
   replay and profile status. Automated UI tests deliberately mock all delivery.
2. Decide unverified-account permissions, enforce them in REST and sockets, and
   define how existing users verify without an accidental lockout.
3. Verify sender delivery, spam placement, link tracking/retention and production
   HTTPS behavior before unrestricted signup.

Reference: [OWASP email verification guidance](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

## Frontend behavior

`/verify-email` is public. Bootstrap captures and strips fragment proof before
BrowserRouter mounts; query-only tokens are rejected. The mounted page retains
proof only in memory. Reload requires reopening the original email link. Same-tab
fragment navigation supports reopening mail without restoring a consumed proof.
Only clicking **Verify email** posts proof; rendering or link scanners do not.
Validation/CSRF/rate rejection permits an explicit retry; expired/reused proof and
ambiguous failures discard it. Success does not log in or change cookies. Signed-in
owner state is reloaded, never inferred from proof that might belong to someone else.

Profile displays stored-address verification status and a deliberate send action.
Unsaved account edits disable sending. Acknowledgement is account-neutral, not a
delivery receipt. A fifteen-minute local cooldown reduces repeat clicks; server
limits remain authoritative across tabs/remounts. Signup sends no mail automatically.
No private environment configuration is changed by this implementation.

## Tests

```sh
npm --prefix server test -- src/__tests__/emailVerification.test.js src/__tests__/authValidation.test.js --maxWorkers=2
npm --prefix server test -- src/__tests__/emailVerificationRoutes.test.js src/__tests__/emailVerificationDelivery.test.js src/__tests__/forgotPassword.test.js src/__tests__/passwordRecoveryConfig.test.js src/__tests__/passwordRecoveryEmail.test.js --maxWorkers=2
npm --prefix client test -- src/__tests__/emailVerification.test.jsx src/__tests__/emailVerificationApi.test.js src/__tests__/appRoutes.test.jsx --maxWorkers=2
# With a local Vite server running (all API responses are mocked):
PLAYWRIGHT_CHANNEL=chrome node server/scripts/check-verification-ui.mjs http://127.0.0.1:5180
```

The suite uses disposable MongoDB and fake accounts only. It covers default and
legacy status, hashed persistence, expiry boundaries, replay and concurrent claims,
concurrent issuance, purpose separation, client field spoofing, email-change races,
revocation, failure handling, and unchanged authenticated access. No real email is sent.
Route tests additionally cover request authorization, body limits, independent
rate budgets, owner-only status, cooldown across email changes, background shutdown
tracking, disabled delivery, generic failure responses, and no-login confirmation.
Existing recovery tests cover the shared dispatcher's active/hourly capacity limits.
