# Portfolio Launch Checklist

Audit date: 2026-10-18. Source baseline: `ebf8cd2`.

**Verdict:** suitable for a portfolio case study, but not ready for unrestricted
public signup and live integrations. Resolve the blockers below before opening
the demo. This is a targeted launch audit, not a complete security assessment.

## Verified baseline

| Check | Result |
| --- | --- |
| Repository before audit | Clean; latest commit `ebf8cd2` |
| Server tests | 276 passed across 17 files |
| Client tests | 153 passed across 16 files |
| Client lint / production build | Passed |
| Isolated summary browser/API checks | Passed, including mobile, dark mode, keyboard, timeout, and access-change scenarios |
| Environment files | Only `.env.example` files tracked; no history entries for `server/.env`, `client/.env`, or root `.env` in locally available refs |

Tests used disposable databases/accounts and mocked external providers. No real
database was modified, no secret values were printed, and no paid AI calls were
made. The environment-file check is not a full historical secret scan. Hosted
configuration, live OAuth, live AI quality, and a full-app deployed journey remain
unverified. Existing passing tests do not cover all findings below.

## Launch blockers, in order

Revocation fix reviewed and verified on 2026-10-19: 280 server tests and 154 client
tests passed; client lint, production build, and `git diff --check` passed. Join
version keys also normalize uppercase ObjectId input so re-added members can join
with either valid hexadecimal representation. Verification used temporary test
databases, not live accounts; hosted two-account testing remains a staging gate.

- [x] **1. Revoke live project access when membership changes.** Fixed after a
  failing regression reproduced stale room membership. Removal now evicts every
  affected tab before removal broadcasts, cleans presence/typing, and invalidates
  pending joins. Account deletion disconnects the deleted user's sockets;
  project deletion evicts its viewers. Tests cover reconnect denial, unrelated
  subscriptions, re-addition, and client navigation. See
  [Realtime Architecture](06-realtime-architecture.md#revoking-live-access) for
  the single-process scope and in-flight operation limitations.

- [ ] **2. Resolve authentication before public signup.** Choose Supabase Auth
  or harden the current JWT implementation; do not run two competing identity
  systems. Reproduced against `authController.js`: one-character passwords are
  accepted at registration (201); an object email selector is interpreted as a
  database query at login (200 with the fixture's matching password); an old JWT
  still works after changing the password (200). The selector finding is not a
  password-check bypass. Require typed, bounded inputs, consistent password
  policy, login/signup throttling, and session invalidation. Decide recovery and
  verification behavior before accepting real accounts. Remove the registration
  response/token console log at `client/src/context/AuthContext.jsx:42`.

- [ ] **3. Remediate dependency advisories and rerun checks.** Current audit
  results differ from September's clean result. Server: 7 affected packages
  (1 critical, 6 high); excluding dev dependencies: `proxy-addr` (critical) and
  `engine.io` (high). Client: 9 affected packages (7 high, 2 moderate); excluding
  dev dependencies: 6. Update deliberately, not with `npm audit fix --force`.
  The nodemon recommendation includes an old major downgrade and needs manual
  review. Keep runtime changes separate from tooling changes.

- [ ] **4. Bound public-demo abuse and cost.** Public registration is open;
  auth routes have no application-level throttling. The AI limiter in
  `taskDraftService.js:17` is per-user, per-process, and resets with the process;
  it is not a global spending cap and new accounts get fresh allowances. Decide
  restricted demo access versus open signup. Add appropriate admission, resource,
  and cost controls, or disable live AI for anonymous/demo visitors. Use fictional
  isolated projects; never expose personal work or shared owner credentials.

- [ ] **5. Complete account deletion and GitHub connection cleanup.** Reproduced:
  deleting an account and its owned project returns 200 but leaves a notification
  referencing that project. `authController.js:273` does not delete Notifications.
  Its GitHub cleanup deletes stored accounts without calling the revocation path
  used by explicit disconnect. Clean up recipient/actor/project references,
  terminate affected sockets, and define provider-revocation failure behavior.
  Current inbox filtering hides missing boards; this does not remove orphan data.

- [ ] **6. Review GitHub OAuth before enabling visitor connections.** The current
  signed state has a ten-minute lifetime and random nonce, but the nonce is not
  consumed and the callback does not bind it to the initiating browser session
  (`githubIntegrationController.js:32-48,115-152`). Add/review browser binding and
  one-time use, including account deletion during authorization. This is a code
  review finding, not a demonstrated live OAuth exploit. The broad `repo` scope
  also needs clear permission copy; use a separate production OAuth application.

Dependency counts are package advisories, not counts of confirmed exploitable
application paths. `trust proxy` is currently unset, so applicability of the
proxy-addr advisory depends on deployment configuration. Several client findings
concern build tools or SSR/RSC paths; this app is a browser SPA, and `--omit=dev`
does not itself identify browser-bundled attack surface. Triage and update rather
than claiming every advisory is reachable. Re-run `npm audit --json` and
`npm audit --omit=dev --json` in each package when addressing item 3.

## Staging gate after blockers

- [ ] Configure separate staging/production MongoDB, JWT/encryption secrets,
  GitHub callbacks, API/socket URLs, and exact allowed client origins. Validate
  required production variables at startup instead of falling back to localhost.
- [ ] Pin the supported Node runtime and document frontend build/output and
  backend start commands. Configure SPA deep-link rewrites on the frontend host.
- [ ] Serve the backend on a WebSocket-capable host with HTTPS. Verify two-account
  collaboration and reconnection against deployed URLs, not just localhost.
- [ ] Configure baseline response security headers, JSON error handling, readiness
  checks, graceful shutdown, and privacy-conscious error monitoring. The current
  `/health` response reports process liveness, not database readiness.
- [ ] Create a repeatable fictional demo dataset and a reset/isolation policy.
  Exercise profile deletion, roles, chat, notifications, workflows, GitHub, and
  optional AI with staging accounts. Verify HTTP and Socket.IO access separately.
- [ ] Record production-secret ownership, database backup/restore, rollback, and
  provider budget/alert procedures. No hosting accounts were inspected in this audit.

## Portfolio packaging / can wait

- [ ] Refresh screenshots and record a short two-account collaboration demo.
- [ ] Write the architecture/trade-offs case study and link the demo/repository.
- [ ] Reconcile README license claims with package license metadata before publishing.
- [ ] Optionally add CI to automate the existing suites and build checks.

New product features, direct-message chat, an autonomous task agent, multi-instance
scaling, and a GitHub App migration are not required for this portfolio launch.
Supabase is an authentication decision, not a prerequisite to running the existing
tests or publishing a case study.

**Next implementation slice:** settle the authentication choice before implementing
the remaining auth work. Socket revocation is complete; no dependency upgrades or
deployment changes are included in that fix.
