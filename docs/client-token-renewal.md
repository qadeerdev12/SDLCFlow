# REST and WebSocket Token Renewal

Status: implemented for the opt-in memory provider. The live application's
legacy mode is unchanged. This is reactive renewal, not a proactive expiry timer.

## Ownership

`MemoryAuthProvider` owns access credentials and the single refresh coordinator.
`sessionRenewal.js` is a small bridge used by transports; it does not store tokens
or create another coordinator. Provider cleanup unregisters only its own handler,
so stale cleanup cannot remove a newer provider's registration.

Concurrent REST and socket expiry signals share the coordinator's pending refresh.
The provider synchronously installs the returned access token before waiting callers
continue. Existing user identity is retained during same-family renewal.

## REST

1. Send the request with its supplied bearer token.
2. Only HTTP 401 with `SESSION_EXPIRED` may request renewal.
3. Retry the original method/body once with the renewed token.
4. If that attempt is also expired, use the existing terminal session-failure path.

This relies on the server authentication middleware rejecting expiry **before**
the controller executes. Do not use `SESSION_EXPIRED` for errors after committing
a mutation. Network failures, server errors, permission errors and revocation
never trigger this retry: an uncertain mutation may already have succeeded.

The provider retains a bounded set of 32 recently issued tokens from the current
local session. A delayed expiry response can reuse its family's newer token.
Login, registration and session clearing invalidate that history. A request from
an earlier account cannot be retried with a newly signed-in account's credentials.
The provider and transport both recheck ownership before dispatching the retry.

## WebSocket

Expiry can arrive through handshake rejection, `session:invalidated`, or an event
acknowledgement. The hook disconnects the old socket and requests shared renewal.
React's token change replaces the socket with a new authenticated connection.
The board's existing connection effect rejoins its room and reloads board state;
notification subscriptions reload on connect.

The hook never replays the original event. An expired acknowledgement rejects its
caller; a timeout also rejects without renewal or replay. Late acknowledgements
from replaced sockets cannot invalidate the current connection. Non-expiry
revocation still follows the terminal session-failure path.

## Failure Policy

An uncertain refresh response requires sign-in; strict rotation means repeating
the request could look like refresh-token reuse. A 429 retains its retry deadline
without starting an automatic retry loop. Explicit retry can retry the user lookup,
which invokes renewal if the server still rejects the bearer as expired.

Session changes, unmounts and account-action intent invalidate waiting renewal
work. Authentication failures do not silently fall back to stored credentials.

## Verification and Remaining Integration

Tests exercise the real provider/coordinator with simulated browser coordination,
plus mocked REST and Socket.IO transports: concurrent renewal, bounded REST retry,
preserved mutation payload, account-switch races, failed refresh, terminal errors,
socket replacement, stale acknowledgements and no timeout replay.

Before enabling memory mode:

- Account actions now use coordinated mutations and await logout completion;
  see [Account Action Integration](account-action-integration.md).
- Stable session keys now preserve UI during renewal while resetting on sign-in;
  see [Session UI Lifetime](session-ui-lifetime.md) for component boundaries and tests.
- Complete coordinated server/client cutover, including legacy credential removal.
- Verify real-browser multi-tab rotation, open drafts, reconnect/rejoin and
  notification recovery against a running refresh-enabled server.

The mocked tests do not establish those real-browser guarantees.
