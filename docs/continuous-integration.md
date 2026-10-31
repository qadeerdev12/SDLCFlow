# Continuous Integration

`.github/workflows/ci.yml` checks pushes to `main`, pull requests targeting
`main`, and manual runs from GitHub Actions. It does not deploy or enable signup.
New commits cancel older runs for the same branch or pull request. No path
filters are used, so documentation-only PRs still produce required checks.

## Checks

| Job | What must pass |
| --- | --- |
| Server tests and production config | Clean server install, disposable MongoDB startup, all server tests, production-only reinstall, production URL preflight |
| Client tests lint and build | Clean client install, all client tests, ESLint, production Vite build |

Both jobs use Ubuntu 24.04 and Node from `.nvmrc`. Package engine checks enforce
the matching npm version bundled with the pinned Node release. The setup action
caches npm downloads keyed by each package's lockfile, not `node_modules`; every
run still installs with `npm ci`. No dependencies or lockfile versions are updated
by CI. See the official [setup-node documentation](https://github.com/actions/setup-node)
for version-file and cache behavior.

The server job explicitly prepares MongoDB 8.2.6 before starting Vitest. This is
a disposable local database, not Atlas. The initial run needs network access to
download the MongoDB binary. Each suite continues to own its test database and
cleanup. Two Vitest workers bound memory use on hosted runners; concurrent request
and race-condition tests still run within their suites. The server job has a
15-minute deadline and the client job has a 10-minute deadline.

## Security And Scope

- Only `contents: read` is granted. Checkout does not persist credentials.
- Actions are pinned to verified full commit IDs; review updates rather than
  silently following moving tags. No `pull_request_target` execution is used.
- No Actions secrets, real `.env` files, live database, OAuth credentials or paid
  provider keys are supplied. Application/provider traffic in tests uses fixtures.
- Production URL preflight and build use reserved `app.example.com` URLs. They
  validate configuration/build behavior, not DNS, TLS or a real deployment.
- The frontend build is not uploaded or deployed: it deliberately contains example
  URLs. Hosting must rebuild with its own reviewed public URLs.
- Browser journeys, actual email delivery, hosted shutdowns, real OAuth, live AI
  quality and dependency vulnerability audits remain separate release checks.

## First Run And Merge Protection

Commit and push the workflow, then open the repository's **Actions** tab and
inspect the **CI** run. A local verification is not evidence of a successful
GitHub-hosted Linux run. Fork PRs may require maintainer approval before running.

After the first successful hosted run, configure the repository ruleset or branch
protection for `main` to require both job checks listed above. Select the names
shown by GitHub. This file creates checks but does not change repository rules or
prevent direct pushes by itself. No remote repository settings were changed.

For failures, inspect the first failing step. Install failures may indicate a
runtime mismatch, stale lockfile or package download issue; MongoDB preparation
failures are not application assertion failures. Do not bypass engine validation
or add automatic test retries to hide failures.

## Local Reproduction

Use the pinned Node/npm versions and a fresh checkout with no private env files.
Run each command separately from the repository root:

```sh
npm --prefix server ci --include=dev
npm --prefix client ci --include=dev
npm --prefix server test -- --maxWorkers=2
npm --prefix client test -- --maxWorkers=2
npm run lint
```

For the final preflight/build, set the same public example URL variables used by
the workflow and `NODE_ENV=production`. Run `npm run check:auth-config` and
`npm run build`. The production-only reinstall removes test dependencies, so use
`npm --prefix server ci --omit=dev` only in a disposable release checkout, not your
active development checkout. Restore development dependencies before testing again.

## Verification Record

On 2026-11-01, the workflow passed actionlint 1.7.12 validation (optional shellcheck
integration was disabled because it was not installed). The CI commands were
reproduced in a temporary source-only checkout on macOS ARM64 with Node 24.22.1 /
npm 11.19.1: clean installs, disposable MongoDB preparation, 654 server tests,
261 client tests, lint, production build, production-only server install and URL
preflight passed. This is not a GitHub-hosted Ubuntu run; confirm that after push.

Fresh npm audits reported 5 server findings (3 moderate, 2 high) and 10 client
findings (8 moderate, 2 high). Server high findings include `body-parser` and
`follow-redirects`; client high findings include `undici` and `zod`. These are
dependency advisories, not proof that each path is exploitable in this app.
No dependencies were changed in this CI slice. Triage runtime/build exposure and
compatible fixes before public release; passing CI is not security clearance.

Subsequent dependency remediation is recorded in the
[security review](production-security-review.md#dependency-follow-up-2026-11-01).
The numbers above describe the original CI setup, not the updated lockfiles.
