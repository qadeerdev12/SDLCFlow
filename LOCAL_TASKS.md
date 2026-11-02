# SDLCFlow Work Tracker

Last updated: 2026-11-02 (Australia/Sydney)
Latest checked commit: `a6357ac` - test(auth): cover recovery paths under verification enforcement
Current uncommitted chunk: rollout chunk 3, staging checklist and evidence template.

## Read First When Resuming

This handoff file is intentionally included in Git during development. Commit and
push updates before switching devices, then pull on the other device. Compare its checkpoint with
`git log -8 --oneline` and `git status --short` before relying on it.
Repository code and newer commits take precedence over this snapshot.
Never store credentials, tokens, real account data or private email links here.

Working agreement:
- Work in small reviewable chunks; stop after each for owner review and commit.
- Explain changes and design decisions as a senior developer teaching.
- Include changed-file references, verification evidence and a suggested commit message.
- Do not commit, push or deploy without explicit authorization.
- Update this file after each chunk: work done, checks, blockers and next action.
- Separate implementation, automated verification and owner-reported manual checks.

## Resume Here

Current phase: authentication release gates before deployment, not new product features.

1. Local verification is restored: installed pinned Node 24.22.1 / npm 11.19.1
   with nvm and reinstalled both dependency trees using `npm ci` without changing
   lockfiles. Many prior dependency files were marked `dataless` by macOS.
   Focused checks passed: 28 client tests, 69 server tests, client lint and build.
   Use `nvm use` from the repository root in new terminals; the shell default was
   not changed. Avoid relying on cloud-offloaded node_modules between devices.
2. WebSocket enforcement is implemented and tested: startup policy snapshot,
   handshake/per-event proof checks and eviction after persisted email changes.
   Full server suite: 892 tests passed across 51 files on 2026-11-01.
3. Frontend verification-required handling is implemented: REST/socket errors
   preserve authentication, protected workspace routes redirect to Profile,
   notifications pause, and an explicit status check reloads the owner's proof.
   Full client suite: 332 tests passed across 34 files; production build passed.
4. Rollout chunk 1 is reviewed and committed. Chunk 2 recovery-path tests pass:
   8 new cases; 118 tests across 5 related suites passed together.
   Owner reviewed chunk 2. Chunk 3 staging checklist/evidence template is prepared,
   awaiting review; hosted checks are NOT RUN. Next: chunk 4, rollback
   procedure/rehearsal, before an approved staging enforcement-on run.
   Stop for review and commit after each. Secure email changes remain a separate
   pre-public-enforcement gate. Do not enable enforcement or unrestricted signup.

Focused checks to resume with (from repository root):

```sh
npm --prefix client test -- src/__tests__/profileLoading.test.jsx src/__tests__/profileSessions.test.jsx src/__tests__/profilePassword.test.jsx src/__tests__/emailVerification.test.jsx
npm --prefix server test -- src/__tests__/verificationAccess.test.js src/__tests__/githubOAuthState.test.js --maxWorkers=2
npm --prefix server test -- src/__tests__/socketSessions.test.js --maxWorkers=2
npm --prefix server test -- src/__tests__/verificationRecoveryPaths.test.js --maxWorkers=2
npm --prefix client run lint
npm --prefix client run build
git diff --check
```

Server integration tests must use disposable databases and mocked providers, not
live accounts. Run the full suites before release; focused checks are not release clearance.

## Completed Implementation

These items describe implemented scope, not blanket deployment approval.

- [x] Projects containing workflows, workflow templates and task cards.
- [x] Real-time collaboration, membership/roles, board chat and notifications.
- [x] Profile/account actions, task checklists and My Tasks.
- [x] Project GitHub integrations, activity and dashboard visualizations.
- [x] AI task drafting/checklists and project summaries.
- [x] Self-managed JWT sessions, memory-only access tokens, rotating refresh cookies,
  REST/socket session validation and revocation.
- [x] Single-service build/start configuration and runtime pins.
- [x] Readiness probes and bounded graceful shutdown.
- [x] GitHub Actions CI configuration (hosted run and required checks still need confirmation).
- [x] Brevo email delivery foundation and safe background diagnostics.
- [x] Password recovery request, single-use reset proof, completion and session revocation;
  recovery pages implemented. Owner reported successful local reset testing.
- [x] Email-verification proof, request/resend/confirmation routes and UI.
  Owner-reported local delivery, confirmation and replay rejection are recorded
  in `docs/email-verification.md`; hosted checks remain open.
- [x] Isolated verified-email guard and opt-in REST access policy.
- [x] Profile and GitHub loading separated, with four new regression tests written.
  GitHub failure/latency no longer shares the profile loading/error path.
  Unsaved edits and stale-response protection are preserved.

## Remaining Release Work

### Authentication and Verification

- [x] Resolve local verification tooling blocker and run latest focused tests/lint/build.
- [x] Verify REST policy behavior with the isolated server suite (69 tests across
  verificationAccess and githubOAuthState; not a full-server-suite result).
- [x] Implement and test WebSocket verified-email enforcement (handshake, packets,
  idle tabs and pending-handshake eviction on email changes).
- [x] Add consistent frontend handling for verification-required responses.
- [ ] Decide and document existing-account rollout; do not silently mark users verified.

Rollout sub-chunks (complete the overall item only after all are reviewed):
- [x] Chunk 1: write existing-account policy and access boundaries; owner reviewed.
- [x] Chunk 2: test restricted-account recovery paths and verification recovery; owner reviewed.
- [x] Chunk 3: prepare staging matrix/checklist and record available evidence honestly; owner review pending.
- [ ] Execute hosted staging checks after explicit approval; checklist preparation is not hosted verification.
- [ ] Chunk 4: document and rehearse rollback; hosted changes require explicit approval.

Other authentication gates:
- [ ] Review secure email changes: reauthentication, pending-address verification,
  notifications and reset-proof invalidation. Current address changes reset verification.
- [ ] Reconcile stale launch-checklist items with the completed recovery/verification work.

### Release and Hosting

- [ ] Confirm successful GitHub-hosted CI and require its checks on main.
- [ ] Rerun dependency audits; resolve or explicitly accept remaining client tooling risk.
  Last documented state: production-only audits clean, six moderate client tooling
  findings remaining. This is historical evidence, not a fresh audit.
- [ ] Choose/provision host and domain, confirm runtime and trusted proxy configuration.
- [ ] Configure isolated staging database, secrets, exact origins and provider callbacks.
- [ ] Verify HTTPS cookies, refresh/revocation, deep links and two-account sockets on staging.
- [ ] Verify real email delivery, spam placement, expiry/replay and reset session revocation.
- [ ] Verify production GitHub OAuth, disconnect and account-deletion cleanup on staging.
- [ ] Configure privacy-safe monitoring, provider budgets/alerts and operational ownership.
- [ ] Document and rehearse backup/restore, rollback and fictional demo reset/isolation.
- [ ] Final full-suite/build/lint/security checks and explicit release review.
- [ ] Refresh portfolio screenshots/demo, architecture case study and license consistency.
- [ ] Before final deployment, move any remaining handoff information into maintained
  project documentation, remove this tracker from Git tracking and add it to
  `.gitignore`. Removal does not erase earlier copies from Git history.

## Decisions to Preserve

- Keep self-managed authentication; Supabase is not a launch dependency.
- One persistent Node service serves React, API and Socket.IO under one HTTPS origin;
  MongoDB Atlas is separate. Start with one instance because some state is process-local.
- Keep initial staging signup restricted and AI disabled until separately validated.
- Email delivery and verified-email access enforcement are separate opt-in policies.
- No host or deployment is confirmed by this tracker.
- Direct messages, autonomous task agents, multi-instance scaling and GitHub App
  migration are deferred, not portfolio launch requirements.

## Reference Files

- `docs/launch-checklist.md`: broad release checklist; some account-flow prose is stale.
- `docs/email-verification.md`: verification implementation and rollout details.
- `docs/deployment-plan.md`: selected deployment topology.
- `docs/continuous-integration.md`: CI and verification records.
- `docs/production-security-review.md`: dependency and security decisions.
- `docs/production-operations.md`: readiness and shutdown behavior.
- `client/src/pages/ProfilePage.jsx`: latest profile loading fix.
- `client/src/__tests__/profileLoading.test.jsx`: latest four regression tests.
- `server/src/__tests__/verificationAccess.test.js`: REST verification policy tests.

## Latest Handoff

2026-11-02 rollout chunk 3: prepared prerequisites, five fictional account roles,
delivery checks with enforcement off and enforcement-on staging checks, plus
sanitized evidence and exit criteria in docs/email-verification-rollout.md.
Delivery checks use explicitly approved mail delivery with access enforcement off;
enforcement-on execution requires reviewed rollback and separate owner approval.
All hosted results remain Not run. Prior chunk 2 was reviewed and committed as
`a6357ac`; its recorded 118-test pass remains historical evidence, not a new run.
Documentation-only chunk: reviewed configuration names/topology against repository
docs and .env.example, and ran whitespace checks. No runtime tests, provider mail,
hosting, configuration or data changes. Next: review/commit chunk 3, then chunk 4
rollback procedure/rehearsal. Secure email changes remain a public-enforcement gate.
No commit/push/deploy performed.

### Previous Implementation Evidence

2026-11-02: Implemented client handling for EMAIL_VERIFICATION_REQUIRED using a
separate in-memory access-restriction event. Current-token checks ignore old
account responses. Socket rejection stops retries without renewing or replaying;
workspace routes redirect to Profile and the notification inbox unmounts.
Profile offers an explicit status check; only the authenticated owner's confirmed
verification clears the gate. Same-session renewal retains the restriction;
new login/logout resets it. Unverified users are not blocked without a server
rejection, preserving disabled-policy behavior.
Full client suite: 332 tests across 34 files passed; client lint and production build passed.
Tests mock network/browser boundaries; no live accounts or mail were used.
Server code and private configuration were unchanged; server tests were not rerun
in this client-only chunk. Hosted/browser end-to-end checks remain outstanding.
Keep enforcement disabled pending rollout and staging review.
No commit/push/deploy performed. Next: existing-account rollout policy.
Commit and push this tracker with relevant changes before switching devices,
and pull before resuming on the other machine.
