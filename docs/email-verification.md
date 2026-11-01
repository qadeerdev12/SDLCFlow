# Email verification foundation

## Current scope

This slice adds internal verification state, one-time proof tokens, and an internal
completion service. There are no public verification routes, emails, resend UI,
or restrictions on unverified accounts yet. Existing signup, login, recovery,
REST access and sockets remain available under their current policies.

## Account state

- `emailVerifiedAt`: null/absent means no proof. Only successful verification sets
  a timestamp. New accounts are not verified automatically.
- `emailVerificationVersion`: starts at zero and increments on each actual profile
  email change. A -> B -> A advances twice, so links for the original A stay invalid.
- Both fields are hidden from default queries and existing API responses. Signup
  and profile input allowlists prevent clients from setting either field.

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
There is no public GET consumer: the later endpoint must use explicit POST
confirmation so email scanners cannot perform the action by opening a link.

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

1. Add rate-limited request/resend and explicit POST confirmation endpoints,
   trusted fragment-based URLs, Brevo delivery and account-neutral responses.
2. Expose verification status deliberately to the account owner; add the verification
   page and resend controls without exposing internal generation counters.
3. Decide unverified-account permissions, enforce them in REST and sockets, and
   define how existing users verify without an accidental lockout.
4. Verify sender delivery, spam placement, link tracking/retention and production
   HTTPS behavior before unrestricted signup.

Reference: [OWASP email verification guidance](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

## Tests

```sh
npm --prefix server test -- src/__tests__/emailVerification.test.js src/__tests__/authValidation.test.js --maxWorkers=2
```

The suite uses disposable MongoDB and fake accounts only. It covers default and
legacy status, hashed persistence, expiry boundaries, replay and concurrent claims,
concurrent issuance, purpose separation, client field spoofing, email-change races,
revocation, failure handling, and unchanged authenticated access. No real email is sent.
