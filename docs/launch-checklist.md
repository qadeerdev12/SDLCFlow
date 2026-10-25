# Portfolio Launch Checklist

Audit date: 2026-10-18. Source baseline: `ebf8cd2`.

Update 2026-10-21: memory-only access tokens, rotating refresh cookies and all four
local Chrome verification chunks are complete. Dependency remediation and
production secret startup checks are covered in the
[production security review](production-security-review.md). The baseline below
is historical; remaining release blockers still apply.

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

- [ ] **2. Harden self-managed JWT authentication before public signup.**
  Decision: retain the existing identity system; no Supabase Auth migration.
  Slice 1 implements typed, bounded input validation, a consistent new-password
  policy, normalized email lookups, safe duplicate handling, and removal of the
  registration response/token log. Object email selectors are rejected before
  database access. Legacy short passwords remain usable for verification.
  Slice 2 adds per-IP login/signup throttling and explicit proxy configuration.
  Session chunk 1 adds user/token versions and checks them on protected REST
  requests, with legacy-zero compatibility. Chunk 2 atomically increments the
  version with password changes and signs the changing tab out. Chunk 3 enforces
  live-session versions/expiry, evicts older sockets after password changes, and
  handles invalid sessions across REST, sockets, and browser tabs.
  Chunk 4 adds confirmed log out everywhere, with atomic generation revocation
  and protection against stale/repeated requests. The four session-invalidation
  chunks are complete for the current single-process deployment.
  Token lifecycle/storage cutover and local browser checks are now complete.
  Still required: account recovery and email verification scope decisions before
  unrestricted public signup. Previously issued JWTs
  now fail REST/socket checks after password changes; multi-instance revocation
  remains outside the current single-process implementation. See
  [Authentication Hardening](authentication.md) for policy and slice details.

- [x] **3. Remediate dependency advisories and rerun checks.** On 2026-10-21,
  compatible lockfile updates resolved the runtime/tooling advisories. Node watch
  replaced nodemon, removing its vulnerable development-only dependency chain
  without a forced downgrade. Full and omit-dev audits report zero findings in
  both packages. Server/client tests, build/lint and browser checks are recorded
  in the production security review; rerun audits before deployment.

- [ ] **4. Bound public-demo abuse and cost.** Public registration is open;
  login/signup now have per-process IP throttling, not distributed abuse controls.
  The AI limiter in
  `taskDraftService.js:17` is per-user, per-process, and resets with the process;
  it is not a global spending cap and new accounts get fresh allowances. Decide
  restricted demo access versus open signup. Add appropriate admission, resource,
  and cost controls, or disable live AI for anonymous/demo visitors. Use fictional
  isolated projects; never expose personal work or shared owner credentials.

- [ ] **5. Complete account deletion and GitHub connection cleanup.** Notification
  cleanup now deletes records whose recipient or actor is the deleted user, or
  whose project is owned by that user. Unrelated records on shared projects are
  preserved. Regression tests cover incorrect credentials, cleanup failure/retry,
  and successful deletion. Socket termination was completed separately.
  Still required: GitHub cleanup currently deletes stored accounts without calling
  the provider-revocation path used by explicit disconnect. Define that failure
  policy and implement it before closing this gate. Account deletion remains a
  multi-step operation, not an atomic transaction.

- [ ] **6. Review GitHub OAuth before enabling visitor connections.** Backend
  browser binding and atomic single-use state are implemented, with ten-minute
  expiry and initiating-session checks before exchange and before saving. Tests
  cover replay, concurrent callbacks, wrong browsers, revocation and account
  deletion. The [browser runner](github-oauth-browser-verification.md) covers
  simulated-provider cross-site cookies and redirects. Real GitHub and deployed
  HTTPS verification remain required; simulated tests do not close this gate. The broad `repo`
  scope also needs clear permission copy; use a separate production OAuth app.

Dependency counts are package advisories, not counts of confirmed exploitable
application paths. `trust proxy` defaults to false and is only enabled by explicit
`TRUSTED_PROXY_CIDRS`; resolve the proxy-addr advisory before enabling that setting
in public deployment. Several client findings
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
Self-managed JWT authentication is the chosen path; Supabase is no longer a
planned launch dependency.

**Next review gate:** resolve the remaining launch blockers and deployment gates
above. The token lifecycle proposal has been implemented and locally verified;
the selected topology is documented in the [deployment plan](deployment-plan.md).
The dependency/security slice is not blanket production approval.
