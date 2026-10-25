# First Deployment Plan

## Decision and Status

Selected layout: one persistent web service serves the React production build,
Express API and Socket.IO under one public HTTPS origin. MongoDB Atlas remains
separate. Start with one application instance. The hosting provider, hostname,
service plan and database environment have not been provisioned or selected here.

This is an architecture/configuration checkpoint, not a deployable release yet.
No secrets, real environment files, DNS records or hosted resources were changed.
Production startup now serves the React build from `client/dist`; development
retains API metadata at `/` and uses Vite separately. Runtime pins and root build/
start commands are implemented. Hosting and the remaining launch gates still
need review before staging deployment.

```text
Browser
  |
  | HTTPS / WSS: one public origin
  v
Hosting HTTPS edge / reviewed reverse proxy
  |
  v
One persistent Node process
  |-- /assets/*       React build assets
  |-- page routes     React entry document
  |-- /api/v1/*       Express API, including GitHub callback
  |-- /socket.io/*    Socket.IO polling + WebSocket upgrade
  |-- /health         existing process liveness endpoint
  |
  |-- MongoDB Atlas  users, projects, refresh sessions, messages
  |-- GitHub         OAuth + repository APIs
  `-- OpenAI         optional server-side AI requests
```

## Why This Layout

One origin matches the current Secure, HttpOnly, SameSite=Strict, host-only
`__Host-sdlcflow_refresh` cookie and exact-origin request guards. It also avoids
separate frontend/API routing configuration for the first release. Do not weaken
cookie or CSRF protection to accommodate unrelated hosting domains.

The current presence registry, socket revocation tracking, notification event bus
and rate-limit storage are process-local. Multiple instances would need a separate
design for shared delivery/state and connection routing. One instance is the
initial operating constraint, not an assertion of high availability.

Render is a candidate, not a provisioned destination: its official documentation
describes persistent [web services](https://render.com/docs/web-services) and
[inbound WebSocket support](https://render.com/docs/websocket). Confirm the service
plan, region, resource limits, proxy behavior and costs before creating anything.
The architecture does not depend on a particular provider.

## Public Configuration Contract

`https://app.example.com` below is a reserved example, not a real selected domain.
Use the exact final hostname everywhere, with no trailing slash in origin values.

| Location | Variable | Production value/purpose |
| --- | --- | --- |
| Server runtime | `NODE_ENV` | `production` |
| Server runtime | `CLIENT_ORIGIN` | `https://app.example.com` |
| Server runtime | `CLIENT_URL` | `https://app.example.com` |
| Client build | `VITE_API_URL` | `https://app.example.com/api/v1` |
| Client build | `VITE_SOCKET_URL` | `https://app.example.com` (not `/socket.io`) |
| Server runtime | `GITHUB_CALLBACK_URL` | `https://app.example.com/api/v1/integrations/github/callback` |
| Server runtime | `PORT` | Host-assigned internal listening port |
| Server runtime | `TRUSTED_PROXY_CIDRS` | Only verified immediate proxy IPs/subnets; unresolved until host review |

Vite URLs are embedded at build time. Changing only server settings will not fix
an already-built client. The GitHub OAuth application must register the same
callback URL; the callback reaches Express before redirecting to the client.
Prefer separate staging and production OAuth applications and databases.

Server-only secrets: `MONGO_URI`, `JWT_SECRET`, `GITHUB_CLIENT_SECRET`,
`GITHUB_TOKEN_ENCRYPTION_KEY`, and optional `OPENAI_API_KEY`. GitHub also needs
`GITHUB_CLIENT_ID`; optional AI needs `OPENAI_TASK_DRAFT_MODEL`. Never place secrets
in a `VITE_` variable, frontend bundle, committed env file or deployment log.
Retain the encryption key when redeploying: existing GitHub tokens depend on it.

Production AI is disabled by default. Enabling it requires `AI_ENABLED=true`,
provider credentials/model, and a reviewed `AI_DAILY_REQUEST_LIMIT` (default 100
attempts shared across drafts, summaries and users in the database). See
[AI usage safeguards](ai-usage-safeguards.md) for persistence, retry/error behavior,
the shutdown switch and why a request allowance is not a dollar spending cap.

## Configuration Preflight

### Signup Admission

Set server-only `REGISTRATION_MODE=restricted` for the initial private portfolio
preview. It closes public self-signup, not login or access for existing accounts.
`open` permits normal signup; it is not a substitute for email verification,
account recovery, abuse controls or AI spending limits.

When unset/empty, development and test environments default to `open`;
production (including unspecified `NODE_ENV`) defaults to `restricted`. Invalid
non-empty values stop app construction. The API snapshots the policy at startup,
so restart after changing it. There is no frontend override or invitation bypass.
Provision isolated demo accounts in a controlled environment before closing signup;
do not temporarily open a publicly reachable production instance to create accounts.
The signup page reads the public policy endpoint and hides its form while restricted
or while availability cannot be confirmed. Existing landing-page signup links
lead to this private-preview state.

### Validate Origins

From `server/`, run against the intended public build/runtime settings:

```sh
npm run check:auth-config -- --production
```

The checker reads configuration without changing it. It now verifies compatible
production NODE_ENV, one HTTPS frontend/API origin including port, a matching
socket origin, exact CORS membership, an optional GitHub callback's path/origin,
and proxy allowlist syntax. Missing GitHub callback is allowed because GitHub is
optional; enabling GitHub requires provider credentials and registration too.

Passing is not proof of secret strength, proxy identity, deployment connectivity,
GitHub registration, browser cookies or readiness. Do not override production URLs
with placeholders merely to obtain a passing result. Local development continues
to use `npm run dev` and `npm run check:auth-config -- --local`.

## Remaining Implementation Gates

1. Static serving is implemented and covered by local routing tests. Verify it
   again through the selected host's HTTPS edge, including deep-link reloads,
   missing assets and Socket.IO transport upgrades.
2. Runtime pins and reproducible build/start commands are implemented below.
   Configure the selected host to honor them and build with final public URLs;
   run only the Node service in production, never Vite's dev server.
3. Review the actual proxy chain. Blank trust is conservative but may group users
   under a proxy IP for rate limiting. Do not deploy without establishing correct
   client-IP handling; do not use blanket trust or guessed provider address ranges.
4. Review secrets, dependency/security findings, database network access and backup
   needs. Keep staging data separate from real user data.
5. Review shutdown/restart handling and health checks. `/health` currently reports
   process liveness, not an active database-readiness check.
6. Deploy staging only after approval, then verify HTTPS cookies, OAuth redirects,
   deep links, Socket.IO polling/upgrades, reconnect and account revocation there.

The [local browser-verification checks](authentication-browser-verification.md)
pass in Chrome and WebKit; Firefox remains launch-blocked. Production HTTPS and
real-device behavior remain unverified.

## Production Static Serving

`server/src/index.js` enables `server/src/config/clientBuild.js` only in production
(also the safe default when NODE_ENV is omitted). The app factory stays API-only
unless given a build directory, keeping integration tests and local Vite isolated.
Missing `index.html` stops startup before the database connection or listener.

The build path is relative to the module, not the working directory. Preserve the
repository layout when packaging: `server/` and `client/dist/` must be siblings.

## Reproducible Build and Start

Use Node **24.22.1** and its bundled npm **11.19.1** for development, CI, builds
and runtime. Node 24 is an LTS line; this pin includes the
[24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1).
`.nvmrc` supports `nvm install` / `nvm use`; `.node-version` supports hosts/tools
that read that convention. Hosts that ignore these files must be configured
explicitly. The three package manifests pin matching engines and packageManager;
their `.npmrc` files enforce versions during installs, not when invoking Node
directly. Do not bypass a mismatch with `--force` or disable engine checks.

The root package is a private command entry point, not an npm workspace. Its
lockfile has no dependencies; the existing client/server lockfiles remain the
source of dependency versions. A root `npm ci` alone does not install either app.
`npm ci` fails on manifest/lockfile drift rather than resolving fresh versions.

In a clean release checkout, with reviewed public URL settings in the build
environment, run from the repository root:

```sh
npm --prefix client ci --include=dev
npm --prefix server ci --omit=dev
NODE_ENV=production npm run check:auth-config
npm run build
npm start
```

The preflight requires the public origins described above and checks effective
build/runtime URL configuration. It does not connect to providers or MongoDB.
Provide server secrets only at runtime; the build does not need them. Vite embeds
public URLs at build time, so never build a release using local development URLs.
`npm start` explicitly sets production mode and forwards to the existing server
command with `server/` as its working directory, preserving dotenv behavior.
These commands target the current macOS/Linux shell environment.

For local verification, use `npm --prefix server ci --include=dev` instead, then
`npm run test:server`, `npm run test:client` and `npm run lint` from the root.
Do not run `ci --omit=dev` in a development checkout unless you intend to remove
its test dependencies. Use a fresh release directory for the production recipe.
Only `client/dist`, server sources/runtime dependencies and the root start
configuration are required to serve the app; client dev dependencies are build
tools and do not need to be included in a final deployment artifact.

Update runtime pins deliberately: change both version files, all three package
manifests and lockfile metadata together, then rerun clean installs, tests, lint
and a production build. `runtimeConfig.test.js` catches inconsistent pins, not
future security advisories. Recheck supported security releases before deployment.

This recipe does not provision hosting, configure a proxy or verify deployed HTTPS.
Keep registration restricted until account recovery and email verification are
implemented and verified on staging, alongside the remaining launch gates.

### Local Release Verification (2026-10-25)

Verified in a separate source copy with no private env files, using the official
Node 24.22.1 macOS ARM64 archive checked against its published SHA-256 and bundled
npm 11.19.1. Clean client/server installs passed without dependency version changes.
All 638 server tests (37 files), 261 client tests (28 files), lint and the client
production build passed. Public-URL preflight used reserved example URLs, not
hosted configuration. A mismatched Node 24.16.0/npm 12.0.2 install was rejected.

After reinstalling server dependencies with `--omit=dev`, root `npm start` served
the actual built SPA and deep links, JSON API 404s, registration policy and
Socket.IO polling against disposable MongoDB. The isolated process/database were
stopped afterward. No real credentials, accounts, OAuth or paid AI calls were used.
This does not verify Linux packaging, hosted HTTPS, proxy behavior or WebSocket
upgrades. Existing Mongoose deprecation warnings remain; clean installs also
reported unapproved optional/development install scripts without failing checks.

- Known page URLs receive `index.html` with `Cache-Control: no-cache`, allowing
  revalidation after deploys. Add new page routes to the allowlist when updating
  `client/src/App.jsx`.
- Generated Vite `/assets/` files are immutable for one year. Keep manually named,
  mutable public files outside that directory; other public files revalidate.
- Missing API, socket, asset and unknown page URLs return JSON 404s, never the SPA.
  Unknown server URLs therefore differ from client-side navigation's home redirect.
- API authentication and `/health` retain their existing behavior. Health remains
  liveness only, not database readiness. Socket.IO owns its transport endpoint on
  the shared HTTP server before Express handles unmatched requests.

Run `npm test -- src/__tests__/clientBuild.test.js` from `server/` to verify routing
with a disposable build fixture. The test includes the actual Socket.IO polling
handshake; it does not claim to verify hosted WebSocket upgrades or HTTPS cookies.
