# Production Security Review

Review date: 2026-10-21. Scope: production startup secrets, proxy/rate-limit policy,
and dependency remediation. This is not a complete penetration test or approval
to expose public signup. See the [launch blockers](launch-checklist.md).

## Changes

- Production startup validates configuration before connecting to MongoDB or
  listening. Missing/short/obvious placeholder signing keys, invalid MongoDB URI
  shape, partial GitHub OAuth configuration, reused signing/encryption keys and
  incomplete AI configuration fail with setting names, never secret values.
- JWT and GitHub encryption keys must be independent and at least 32 bytes as
  supplied. Length and placeholder checks cannot establish randomness: generate
  at least 32 random bytes using a cryptographic generator and store the encoded
  result in the hosting provider's secret manager.
- Production GitHub token encryption no longer falls back to JWT_SECRET.
  Development/test retains the legacy fallback for local compatibility.
- Compatible dependency updates are recorded in both lockfiles. No forced major
  downgrade or advisory-suppressing override was used.
- The remaining vulnerable development chain was nodemon -> chokidar -> braces.
  It was removed by switching `npm run dev` to Node's native `--watch` mode. Use a
  supported Node release with stable watch support (the verification used Node 24).
  Files imported by the server are watched; nodemon's interactive `rs` is no
  longer available. Stop/start the process when changing environment files.

Review [startup validation](../server/src/config/productionSecurity.js),
[startup wiring](../server/src/index.js),
[encryption boundary](../server/src/models/GitHubAccount.js), and
[regression tests](../server/src/__tests__/productionSecurity.test.js).
The production check is invoked by the server entry point, not every test app
factory. `NODE_ENV` omitted defaults to production; explicit development/test
does not impose production secret checks. Public URL/cookie validation remains
in the existing runtime and deployment configuration checks.

## Dependency Evidence

Initial full npm audit: server 9 affected packages (8 high, 1 critical); client 9
(7 high, 2 moderate). After compatible updates and removing nodemon, both full
dependency audits report zero vulnerabilities. Both `npm audit --omit=dev` checks
also report zero. These are advisory results at review time, not proof of absence
of vulnerabilities. Build tools and SSR/RSC findings do not automatically imply
an exploitable browser-SPA path.

Verification after updates: 555 server tests, 250 client tests, client lint,
production build and all four auth browser chunks passed (Chrome 155.0.8059.85).
The updated Vite emits an envFile deprecation warning in the browser runner;
the suite still passes and no environment values are printed by that warning.

Examples of resolved runtime dependencies: `proxy-addr` is now 2.0.8 and
`engine.io` is 6.6.11. Vite resolves to 8.3.5. Reproduce dependencies with `npm ci`
from the committed lockfiles and rerun audits before release.

## Proxy and Rate-Limit Review

The existing policy stays: no proxy trust by default, explicit IP/CIDR allowlists
only, no blanket trust or hop-count shortcut. The tests exercise forged forwarded
headers, nearest-untrusted-hop selection and IPv6 /56 grouping. Login and signup
budgets are separate; refresh and logout budgets are separate too. These counters
are in process memory, reset on restart and are not distributed or global AI cost
controls. Keep the first deployment to one instance.

The actual hosting proxy remains unresolved. Verify its immediate peer addresses,
forwarded-header rewriting, alternate network paths and observed client IPs in
staging. An arbitrary allowlist passing syntax checks is not trusted evidence.
Blank trust behind a proxy may group users into one rate-limit bucket. Never solve
that by trusting every caller's X-Forwarded-For header. See
[Express's proxy guidance](https://expressjs.com/en/guide/behind-proxies.html).

## Secret Operations

Only example env files are tracked in the current checkout. Actual secret values
were not printed or rewritten. This is not a complete repository-history scan or
validation of live provider credentials. Follow
[OWASP's secrets guidance](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
for generation, access controls and lifecycle ownership.

Do not casually rotate GITHUB_TOKEN_ENCRYPTION_KEY: stored GitHub credentials need
the original key. Existing deployments using the JWT fallback or a reused key need
an explicit re-encryption/reconnection migration before adopting independent keys.
This change does not migrate ciphertext. JWT rotation invalidates existing signed
tokens; plan it with session revocation and user reauthentication. Keep staging and
production keys/databases separate. Never put secrets in VITE_ variables.

## Remaining Release Gates

- Configure verified proxy trust, HTTPS routing and database TLS/network access on
  the chosen host. No hosting resources were inspected or changed here.
- Resolve the existing GitHub OAuth state binding/one-time-use finding before
  enabling visitor connections.
- Resolve account-deletion notification cleanup and provider token revocation;
  the browser deletion tests do not certify every dependent-data cleanup path.
- Decide public-demo admission and AI spending limits. Per-process rate limits
  are not sufficient evidence of bounded public-demo cost.
- Add/review response security headers with production static serving, safe error
  responses/logging, readiness and graceful shutdown. Cookie flags and CSRF guards
  already exist, but they do not replace these deployment controls.
- Finish real HTTPS and cross-browser verification before claiming readiness.
