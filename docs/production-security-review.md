# Production Security Review

Review date: 2026-10-21. Scope: production startup secrets, proxy/rate-limit policy,
and dependency remediation. This is not a complete penetration test or approval
to expose public signup. See the [launch blockers](launch-checklist.md).

## Dependency Follow-Up: 2026-11-01

The October zero-advisory result below is historical. A fresh audit during CI
setup found 5 affected server packages and 10 affected client packages. Targeted
lockfile updates stayed within existing dependency ranges; no manifest changes,
forced upgrades, downgrades or overrides were introduced.

| Dependency | Locked change | Exposure in this repository |
| --- | --- | --- |
| body-parser | 2.3.0 -> 2.4.0 | Express runtime JSON parsing; priority fix for compressed-body denial of service |
| qs | 6.16.0 -> 6.17.1 | Express/runtime and HTTP test dependency; patched without claiming the vulnerable stringify path is used |
| follow-redirects | 1.16.1 -> 1.16.2 | Disposable MongoDB test binary downloader, not the API runtime |
| vitest and @vitest packages | 4.1.11 -> 4.1.12 | Test tooling in both packages |
| undici | 8.10.2 -> 8.12.3 | Client jsdom test environment; not Node's separately bundled fetch implementation |
| zod | 4.4.3 -> 4.6.7 | React Hooks lint plugin dependency, not application form validation |

Vitest's compatible support dependencies were re-resolved with its patch update.
The runtime version and app behavior were not changed. The body-parser advisory
and patch are documented in [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).

After clean installs using the updated locks, server full and production-only
audits returned zero findings. Client production-only audit also returned zero;
its full audit still returned **6 moderate package findings**, all propagated
through the ESLint/minimatch chain. There are no remaining high/critical findings
in either package at this review time. Audit absence is not security certification,
and `--omit=dev` alone is not a browser-bundle exposure analysis.

### Remaining Tooling Advisory

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affects
minimatch below 11.0.1. The locked ESLint 10/config-array dependencies require
minimatch 10, and even the reviewed ESLint 10.14.0 metadata still requires 10.x.
Forcing 11.x would exceed their declared range; npm's proposed ESLint downgrade
does not constitute a verified fix. This change deliberately leaves the advisory
visible instead of suppressing it or making an unreviewed major override.

The affected code is lint tooling for repository-owned globs, not an HTTP input
handler or shipped application import. The advisory describes pattern amplification
at optimizationLevel >= 2; inspected ESLint/config-array call sites do not set
that option. This is limited exposure evidence, not a blanket non-exploitability
claim. Untrusted PRs can change repository code/configuration, so retain CI's
read-only permissions, lack of secrets and job deadline. Before public release,
review an upstream-compatible fix or explicitly decide the residual tooling risk.
The launch checklist keeps this follow-up open.

Verification uses a separate source-only checkout and clean `npm ci` installs
with Node 24.22.1/npm 11.19.1. All 654 server tests and 261 client tests passed,
as did client lint and the production build with reserved example URLs. Existing
Mongoose deprecation warnings remain. This is local macOS verification, not a
hosted CI run or staging test. Local development `node_modules` are not rewritten:
run `npm ci --include=dev` in each package with the pinned runtime before using
the new lockfiles locally, and restart any running dev servers. No live database,
OAuth credentials or paid providers are used in verification.

## Original October Changes

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
