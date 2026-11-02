# Email Verification Rollout

Updated: 2026-11-02 (Australia/Sydney).
Status: policy and recovery-path tests reviewed; staging checklist prepared.
Rollout is not authorized or enabled, and hosted checks have not been run.

This runbook complements [the implementation notes](email-verification.md).
It does not change configuration, migrate users or authorize sending email.

## Reviewable Chunks

| Chunk | Deliverable | Status |
| --- | --- | --- |
| 1 | Existing-account policy and access boundaries | Reviewed by owner |
| 2 | Focused recovery-path regression tests with enforcement enabled | Reviewed by owner |
| 3 | Isolated staging checklist, test-account matrix and evidence record | Prepared; awaiting owner review; hosted execution pending |
| 4 | Rollback procedure and rehearsal evidence | Pending |

Stop for review and a separate commit after each chunk. Actual hosting changes,
provider email sends and enabling enforcement require a separate explicit decision.

## Chunk 1: Existing-Account Policy

### Verification Evidence

- Existing and newly registered accounts follow the same proof requirement.
- Only a valid stored `emailVerifiedAt` satisfies the implemented access guard.
  Missing/null legacy state is unverified. Do not backfill timestamps merely
  because an account exists, has logged in, or has connected GitHub.
- Owners and admins do not bypass verification. Board roles still apply after
  verification; proving an email does not grant project membership or admin rights.
- No migration changes passwords, roles, ownership, tasks or messages. Restricted
  access does not delete user data or transfer ownership to another member.
- No bulk verification mail is sent as part of this policy. Requests remain
  explicit and subject to existing delivery configuration and rate limits.

### Access While Restricted

Enforcement adds an authorization requirement to collaboration, not a new login
requirement. A valid signed-in session is retained when verification is required.

| Area | Policy |
| --- | --- |
| Login and session refresh | Retain existing credential, cookie and session checks |
| Profile and verification request/status | Remain accessible to the authenticated owner |
| Verification confirmation and password recovery | Retain existing proof, origin and rate-limit requirements |
| Password change, logout and account deletion | Remain outside the verification guard; existing checks still apply |
| Projects, tasks, chat, activity, notifications and GitHub resources | Require verification when enforcement is enabled |
| Socket handshake and incoming collaboration events | Require verification when enforcement is enabled |
| Signup | Remains governed independently by `REGISTRATION_MODE` |

"Accessible" does not mean bypassing passwords, CSRF checks, throttles or provider
cleanup requirements. Recovery alone does not mark an email verified. The UI must
keep Profile available and explain how to request a link and check verification.
Existing authenticated sessions may be restricted without being logged out.

### Rollout Boundaries

- Keep `EMAIL_VERIFICATION_REQUIRED=false` until the remaining chunks and release
  gates pass. Mail delivery enablement is a separate setting, not proof that
  enforcement is ready.
- The current enforcement flag is server-wide, captured at startup. There is no
  per-user cohort switch or automatic grace period. Test-account rollout means
  an isolated staging environment, not selectively enabling production users.
- Before affecting existing real users, communicate the verification requirement,
  how to regain access and where to report delivery problems. Record the planned
  activation time and owner approval in the staging/release evidence, not here
  as an invented deadline.
- If a user cannot access their inbox, do not manually mark their account verified
  or use an unreviewed address-change bypass. Secure email changes remain a
  separate pre-public-enforcement gate; the current immediate-change endpoint is
  not considered the final recovery policy.
- Keep public signup restricted until recovery, delivery, secure email changes
  and the other launch gates pass. Completing this document is not release clearance.

## Chunk 1 Acceptance

- [x] Existing/new accounts and owner/admin treatment are explicit.
- [x] Verification does not grant roles or remove existing data.
- [x] Account recovery and verification routes remain outside collaboration gating.
- [x] Server-wide scope and isolated staging are explicit.
- [x] No automatic verification, mass mail, data migration or flag change is authorized.
- [x] Owner reviewed the policy before the next chunk.

Implementation references: `server/src/routes/authRoutes.js`,
`server/src/middleware/requireVerifiedEmail.js`,
`server/src/config/emailVerificationPolicy.js` and
`client/src/components/ProtectedRoute.jsx`.

## Chunk 2: Recovery-Path Regression Tests

`server/src/__tests__/verificationRecoveryPaths.test.js` exercises the assembled
Express app with `EMAIL_VERIFICATION_REQUIRED=true` and signup restricted.
Real authentication, proof consumption and session records use disposable MongoDB;
only email transport is mocked. No real messages or existing accounts are touched.

The eight cases cover:

- Profile reads/edits, verification request/resend cooldown, confirmation and
  resource access restored with the original bearer; replay is rejected.
- Login, cookie refresh and logout of one session without revoking another.
- Log out everywhere, followed by successful but still-unverified login.
- Password change with current-password validation and old-session revocation.
- Password recovery without a bearer, old-password/session rejection and a
  fresh verification request after login; reset does not grant verification.
- Account deletion while unverified, retaining the correct-password requirement.
- Authentication, browser-origin and restricted-signup boundaries remaining active.
- Failed email delivery leaving Profile/logout available without granting access.

```sh
npm --prefix server test -- src/__tests__/verificationRecoveryPaths.test.js --maxWorkers=2
```

The new suite passed 8/8 cases on 2026-11-02 using Node 24.22.1 / npm 11.19.1.
The combined run with `verificationAccess`, `emailVerificationRoutes`,
`socketSessions` and `authSessionIntegration` passed 118 tests across five files.
Existing socket and client regression suites cover connection rejection,
verification-required navigation and credential preservation; these HTTP tests
do not substitute for a real browser/mail/HTTPS staging journey. GitHub-linked
account deletion still has its existing provider-revocation checks and requires
separate staging verification.

- [x] Automated recovery journeys pass with enforcement enabled in tests.
- [x] Owner reviewed chunk 2 before staging checklist work began.

## Chunk 3: Staging Acceptance Checklist

This is an execution plan, not evidence of a deployment. Use the
[deployment plan](deployment-plan.md) for build/runtime settings and
[production operations](production-operations.md) for readiness and shutdown.
Do not provision services, send mail or change a hosted flag without explicit
owner approval. Chunk 4 must provide a reviewed rollback procedure before the
enforcement-on phase is executed.

### Prerequisites

- [ ] Record the release commit, operator, date/time with timezone, host and exact
  HTTPS origin. Build React, API and Socket.IO from that same commit.
- [ ] Use a separate staging database and independent staging secrets. Confirm
  there are no real projects/accounts in the target database; never copy production
  data merely to make fixtures convenient.
- [ ] Run one persistent application instance. Confirm Node 24.22.1 / npm 11.19.1,
  reviewed proxy configuration and exact-origin guards. No guessed proxy ranges.
- [ ] Set build-time API/socket origins and runtime frontend, verification and
  password-reset origins to the approved staging origin. Keep secrets server-only.
- [ ] Keep `REGISTRATION_MODE=restricted` and `AI_ENABLED=false`. Prepare fictional
  accounts through a controlled isolated setup before closing signup; never open
  a publicly reachable instance just to seed users.
- [ ] Authorize a small, explicit set of tester-controlled recipient inboxes and
  the staging sender/provider configuration. Confirm delivery quota and who will
  investigate failures; do not use real customers or shared owner credentials.
- [ ] Run fresh server/client suites, client lint/build and configuration preflight.
  Record exact results; older local passes do not certify the deployed artifact.
- [ ] Verify `/health`, database-backed `/ready` and direct Profile/verification/
  recovery deep-link reloads through HTTPS. Confirm the refresh cookie is Secure,
  HttpOnly and host-only without recording its value.
- [ ] Assign a rollback operator and review chunk 4 before enabling enforcement.
  Secure email changes remain a separate prerequisite for public enforcement;
  private staging tests do not close that gate.

### Fictional Account Matrix

Record only these aliases in committed evidence, not real inbox addresses/passwords.
Use separate browser profiles for different accounts, and separate tabs to test
multiple connections for the same account. Do not manufacture verification dates.

| Alias | Starting state | Purpose |
| --- | --- | --- |
| Owner A | Existing project owner, unverified | Owner has no bypass; verify and resume the existing project |
| Member B | Existing member of A's project, unverified | Independent verification and two-account collaboration |
| Admin C | Existing admin, unverified | Admin also has no bypass |
| Outsider D | Verified through the normal email flow, not a project member | Verification must not grant membership |
| Recovery E | Unverified, disposable, no GitHub connection | Reset/change password, logout and deletion without damaging collaboration fixtures |

Prepare accounts before the rehearsal; this checklist does not provide or authorize
a data migration. Legacy missing-proof behavior is covered by automated guard
tests; any additional legacy fixture must be confined to the disposable test data.

### Phase A: Delivery With Enforcement Off

Keep `EMAIL_VERIFICATION_REQUIRED=false`. Enable verification/recovery delivery
only after the approved recipient/sender setup is ready, and restart for changed
startup configuration. These are distinct switches, not a single rollout toggle.

| ID | Check | Expected result | Hosted result |
| --- | --- | --- | --- |
| A1 | Sign in as A/B/C and reload Profile | Account remains usable without proof while enforcement is off; signup stays restricted | Not run |
| A2 | Explicitly request verification for D | Mail reaches the intended inbox; record inbox/spam outcome and delay, not the link | Not run |
| A3 | Open the email link, then explicitly confirm | Correct staging HTTPS origin; opening alone does not confirm; confirmation succeeds without signing in a different user | Not run |
| A4 | Reopen the consumed link | Safe invalid/used-link feedback; no new session or verification for another account | Not run |
| A5 | Request a replacement within cooldown | Safe acknowledgement; no extra email; use the latest valid link, not repeated retries | Not run |
| A6 | Use an expired unused verification link | Rejected without granting access; use natural configured expiry or an isolated automated fixture, not a hosted database clock edit | Not run |

Stop if delivery, origin, proof handling or account identity is wrong. Provider
acceptance alone is not delivery evidence. Do not enable enforcement to debug mail.

### Phase B: Enforcement in Isolated Staging

Proceed only after Phase A passes, chunk 4 is reviewed, and the owner approves this
specific staging change. Set `EMAIL_VERIFICATION_REQUIRED=true` on the isolated
single service and restart; do not change signup admission. Record the restart and
release identity. Existing socket connections will be interrupted by that restart.

| ID | Check | Expected result | Hosted result |
| --- | --- | --- | --- |
| B1 | A/B/C open workspace routes | Verification required regardless of role; UI directs to Profile without logout | Not run |
| B2 | Inspect denied REST reads/mutations and socket connection | REST returns `403 EMAIL_VERIFICATION_REQUIRED`; socket rejects before private rooms; no task/chat write or retry loop | Not run |
| B3 | A requests and confirms verification, then checks status in original tab | Only A becomes verified; original signed-in session remains usable; Profile status updates; B/C stay restricted | Not run |
| B4 | Reload, renew an expired access token, and navigate back while restricted | Restriction is rediscovered/preserved; no refresh/reconnect loop, no automatic mail or replayed writes | Not run |
| B5 | B verifies; A/B collaborate and reconnect | Both rejoin/refetch; card/chat updates and notifications arrive once; presence settles correctly | Not run |
| B6 | D attempts to access A's project | Existing membership rules deny access despite verified email | Not run |
| B7 | E requests password recovery and resets password | Old password/sessions fail; new login succeeds but remains unverified; verification request still works | Not run |
| B8 | E changes password, logs out one session, then logs out everywhere | Current-password checks hold; single logout preserves another independent session; global logout revokes both | Not run |
| B9 | E deletes account, first with wrong then correct password | Wrong password rejected; correct deletion succeeds; old sessions cannot access account | Not run |
| B10 | Controlled delivery-disabled rehearsal | Resend reports unavailable; Profile/logout/recovery retain their independent policies; no verification bypass or repeated retry loop | Not run |

B10 changes only the verification-delivery switch with explicit approval, followed
by restart and restoration; do not simulate failure by corrupting credentials or
breaking a shared provider. Mocked transport failures are already automated.
Use fresh disposable fixtures for destructive cases; do not reuse a deleted E.
Inspect browser networking only locally, never attach raw HARs containing secrets.
Real GitHub-linked deletion and the final secure email-change journey remain
separate release gates, not covered by E's unlinked deletion.

### Evidence and Exit Criteria

Current evidence snapshot, 2026-11-02:

| Evidence | Status |
| --- | --- |
| Local recovery suite plus related backend suites | Previously passed: 118 tests / 5 files in chunk 2 |
| Local full client suite, lint and build | Previously passed: 332 tests / 34 files in frontend chunk |
| Hosting, HTTPS, provider delivery and A/B checks above | Not run; no staging environment verified in this chunk |
| Rollback rehearsal | Pending chunk 4 |

For each executed check record: check ID, commit SHA, environment alias, operator,
timestamp/timezone, browser/version, account alias, expected/observed result,
Pass/Fail/Blocked status and a sanitized evidence reference. Keep screenshots
free of addresses, credentials, proof URLs, cookies and provider payloads. Store
sensitive operational details privately, not in this repository or task tracker.

- [ ] Every required check has evidence tied to the deployed commit.
- [ ] Failures are fixed and rerun; missing evidence stays blocked, never assumed passing.
- [ ] The operator confirms original safety settings were restored after rehearsals.
- [ ] Owner reviews results before any wider rollout; no automatic public launch.

Chunk 3 completes the checklist preparation only. Hosted execution, unresolved
launch gates and chunk 4 remain open even after this document is reviewed.
