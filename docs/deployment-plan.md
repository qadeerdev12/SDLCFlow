# First Deployment Plan

## Decision and Status

Selected layout: one persistent web service serves the React production build,
Express API and Socket.IO under one public HTTPS origin. MongoDB Atlas remains
separate. Start with one application instance. The hosting provider, hostname,
service plan and database environment have not been provisioned or selected here.

This is an architecture/configuration checkpoint, not a deployable release yet.
No secrets, real environment files, DNS records or hosted resources were changed.
The current Express app still returns API metadata at `/`; it does not yet serve
the React build. Static serving and deployment packaging are subsequent work.

```text
Browser
  |
  | HTTPS / WSS: one public origin
  v
Hosting HTTPS edge / reviewed reverse proxy
  |
  v
One persistent Node process
  |-- /assets/*       React build assets (to implement)
  |-- page routes     React entry document (to implement)
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

## Configuration Preflight

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

1. Add production-only static serving for `client/dist`, preserving local Vite
   development. Known page routes must support direct navigation/reload. Missing
   assets and API routes must not fall through to HTML; socket routes must keep
   reaching Socket.IO. Define index/asset caching explicitly and test these paths.
2. Add reproducible build/start configuration for both packages and pin a supported
   Node runtime. Build the client with its final public URLs; run only the Node
   service in production, never Vite's dev server.
3. Review the actual proxy chain. Blank trust is conservative but may group users
   under a proxy IP for rate limiting. Do not deploy without establishing correct
   client-IP handling; do not use blanket trust or guessed provider address ranges.
4. Review secrets, dependency/security findings, database network access and backup
   needs. Keep staging data separate from real user data.
5. Review shutdown/restart handling and health checks. `/health` currently reports
   process liveness, not an active database-readiness check.
6. Deploy staging only after approval, then verify HTTPS cookies, OAuth redirects,
   deep links, Socket.IO polling/upgrades, reconnect and account revocation there.

These are follow-up tasks, not changes implemented by this document. The four
[local browser-verification chunks](authentication-browser-verification.md) pass;
production HTTPS and other browser engines remain unverified.
