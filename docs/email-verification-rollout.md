# Email Verification Rollout

Updated: 2026-11-02 (Australia/Sydney).
Status: policy ready for owner review; rollout is not authorized or enabled.

This runbook complements [the implementation notes](email-verification.md).
It does not change configuration, migrate users or authorize sending email.

## Reviewable Chunks

| Chunk | Deliverable | Status |
| --- | --- | --- |
| 1 | Existing-account policy and access boundaries | Written; awaiting owner review |
| 2 | Focused recovery-path regression tests with enforcement enabled | Pending |
| 3 | Isolated staging checklist, test-account matrix and evidence record | Pending |
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
- [ ] Owner reviews the policy before the next chunk.

Implementation references: `server/src/routes/authRoutes.js`,
`server/src/middleware/requireVerifiedEmail.js`,
`server/src/config/emailVerificationPolicy.js` and
`client/src/components/ProtectedRoute.jsx`.
