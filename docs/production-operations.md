# Production Operations Foundation

## Health Versus Readiness

Use `GET /health` for process liveness and `GET /ready` for traffic readiness.
Both are public, non-cacheable endpoints with generic responses. They expose no
database host, credentials or driver diagnostics.

`/ready` returns 200 only when Mongoose is connected, an active database ping
succeeds, and shutdown has not begun. The MongoDB driver bounds the ping to one
second. A disconnected database, failed ping or drain returns 503. A successful
ping is not proof of write permissions, indexes, provider availability or complete
application functionality. Readiness checks do not replace staging smoke tests.

Configure the chosen host's readiness check to `/ready`. If the host supports a
separate liveness check, use `/health`; restarting repeatedly during a database
outage is not a recovery strategy. Verify the host's actual health semantics and
failure thresholds before enabling traffic.

## Shutdown

The entrypoint installs SIGTERM and SIGINT handlers. Shutdown:

1. Marks the process draining immediately. New Express work receives 503 with
   `SERVER_DRAINING` and a Retry-After hint; readiness becomes unavailable.
2. Closes Socket.IO and its shared HTTP listener. Node drains existing HTTP
   responses while the listener stops accepting connections. Existing sockets
   close; a new connection completing authentication during drain is rejected.
3. Waits for already-started handlers registered through `registerMutation` to
   settle. Their awaited persistence, activity and notification work completes
   before the database is closed. New mutation dispatch is rejected during drain.
4. Removes the notification subscriber, disconnects Mongoose and exits with 0.

Repeated signals reuse the same shutdown promise. A single 15-second deadline
covers the whole sequence; exceeding it or encountering a cleanup failure exits
with 1. Startup failure also exits with 1. The host termination grace period must
exceed this deadline, with room for signal delivery and platform overhead.

This is bounded best-effort draining, not a transaction or an exactly-once queue.
Forced termination can interrupt work. A disconnected client may not receive an
acknowledgment for a write that did persist; refetch state rather than replaying
mutations automatically. Aborted HTTP requests and independently started future
background jobs are not guaranteed to finish. Board joins are read-only and are
not mutation-tracked. Keep one instance until shared-state scaling is designed.

## HTTP Safety And Logging

Express suppresses X-Powered-By and adds nosniff, frame denial, no-referrer and
disabled camera/microphone/geolocation permissions. A final error handler returns
JSON for malformed/oversized JSON bodies and generic unhandled server failures.
Unknown routes return JSON 404s in API-only mode as well as built-app mode.

Startup/database logs and the new final error handler do not serialize exceptions,
request bodies, tokens or database addresses. This does not audit or replace all
existing controller/service logs. Privacy-reviewed monitoring, HTTP-edge logging,
Content Security Policy and HTTPS/HSTS policy still require release review.
Socket.IO owns its transport outside Express; these middleware headers are not a
claim about every transport handshake response.

## Verification

- `serverLifecycle.test.js`: readiness states, shutdown races/order/deadline,
  parser errors, generic failures and baseline headers. A real HTTP response is
  held open to verify database disconnect waits for it; fake-time tests also
  stall transport close and database disconnect independently.
- `clientBuild.test.js`: the `/ready` namespace cannot be shadowed by a static
  asset, including when the file exists in the production build.
- `serverProcess.test.js`: starts the real entrypoint in an empty working folder,
  uses temporary MongoDB and a disposable account, verifies readiness, connects
  an authenticated WebSocket, then verifies clean exit for SIGTERM and SIGINT.
- `accessSessions.test.js`: its isolated refresh router is mounted before the
  production app's terminal 404; existing family revocation tests remain intact.
  A real authenticated socket verifies failed mutations release their tracking
  and new mutation dispatch is rejected once draining begins.

On 2026-10-31, 649 server tests and 261 client tests passed on Node 24.16.0,
along with client lint, build, syntax and diff checks.

On 2026-11-01, the expanded suite passed on the repository-pinned Node 24.22.1:
654 server tests across 39 files and 261 client tests across 28 files, including
real SIGTERM/SIGINT child-process checks. `git diff --check` also passed. The
temporary runtime archive was checked against its published SHA-256; the global
Node installation was unchanged. Existing local dependencies were used, so clean
install/hosted release verification remains a CI/staging gate. Existing Mongoose
deprecation warnings remain unrelated. No live database, user credentials or
paid provider calls were used; isolated test servers and databases were closed.

## Remaining Release Work

1. The [CI workflow](continuous-integration.md) automates clean installs, suites,
   lint and build using the pinned runtime. Confirm its first hosted Linux run
   and require both checks on `main`; remote branch rules are not yet configured.
2. Implement and verify the committed recovery/email-verification flows before
   unrestricted signup. Choose an email provider and sender domain first.
3. Select hosting, review proxy trust and configure isolated staging secrets and
   database. Keep registration restricted and AI disabled initially.
4. Verify actual HTTPS cookies, OAuth, deletion, WebSocket upgrades/reconnect and
   two-account collaboration against staging. Include restart and database outage
   exercises; confirm the platform sends the expected shutdown signal.
5. Document monitoring, backups/restore, rollback, demo reset and ownership.

This foundation does not provision or approve a public deployment. Track the
remaining gates in [the launch checklist](launch-checklist.md).
