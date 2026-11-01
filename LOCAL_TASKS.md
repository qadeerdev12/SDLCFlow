# SDLCFlow Work Tracker

Last updated: 2026-11-01 (Australia/Sydney)
Latest checked implementation commit: `c9079e2` - fix(profile): isolate GitHub loading from account verification

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

1. Re-establish automated verification of the latest Profile and REST policy changes.
   The last client test and lint attempts failed during dependency loading with
   filesystem `ETIMEDOUT`; no test pass was established. `git diff --check` passed.
   The machine ran Node 24.16.0, while the repository pins Node 24.22.1 / npm 11.19.1.
   Check runtime and dependency availability before rerunning checks.
2. Next implementation slice: email-verification enforcement for WebSockets.
   Inspect handshake, event authorization and session renewal first; define the
   expected rejection/reconnect behavior and add isolated regression tests.
3. Follow with frontend handling and an explicit existing-account rollout policy.
   Do not enable enforcement or unrestricted signup before these gates are ready.

Focused checks to resume with (from repository root):

```sh
npm --prefix client test -- src/__tests__/profileLoading.test.jsx src/__tests__/profileSessions.test.jsx src/__tests__/profilePassword.test.jsx src/__tests__/emailVerification.test.jsx
npm --prefix server test -- src/__tests__/verificationAccess.test.js src/__tests__/githubOAuthState.test.js --maxWorkers=2
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

- [ ] Resolve local verification tooling blocker and run latest focused tests/lint/build.
- [ ] Verify pending REST policy behavior with the isolated server suite.
- [ ] Implement and test WebSocket verified-email enforcement.
- [ ] Add consistent frontend handling for verification-required responses.
- [ ] Decide and document existing-account rollout; do not silently mark users verified.
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

2026-11-01: Created this tracker; the owner chose to include it in Git temporarily
for cross-device handoffs and remove it from tracking before final deployment.
Prior implementation
checkpoint `c9079e2` was committed and the tree was clean before tracker setup.
No application behavior changed in this documentation chunk. No commit/push/deploy
performed. Next session: verify the latest auth changes, then take the socket
enforcement slice. Commit and push this tracker with relevant changes before
switching devices, and pull before resuming on the other machine.
