# Client Refresh Coordinator

> Historical implementation guide. The coordinated cutover is now active in source.
> For current startup, token policy and verification status, see
> [Active Authentication and Cutover](authentication-cutover.md). Earlier opt-in
> and legacy-default statements below describe the pre-cutover stages only.

Status: connected to the opt-in [memory provider](memory-auth-provider.md), but
not to the live app's default provider, api.js or useSocket. Current live login,
localStorage token usage, and server activation are unchanged.

## Code Map

- `client/src/lib/refreshCoordinator.js`: cookie-auth transport, per-tab refresh
  deduplication, cross-tab serialization, stale-result protection and cleanup.
- `client/src/__tests__/refreshCoordinator.test.js`: deterministic fake-browser
  tests, including separate coordinators sharing locks, storage and messages.

Create one coordinator per tab at the provider boundary in the next slice.
Importing the module has no side effects: no channel, listener or network request
is created until the factory is called. Dispose the instance when its owner ends.

## Contract

- `refresh()` returns one shared promise for concurrent callers in the current
  local session generation. A later explicit call can start another request.
- `mutate(action, { body, token })` handles login, register, logout, password,
  logoutAll and deleteAccount using a fixed path/method allowlist. Supply bearer
  tokens for password/logoutAll/deleteAccount; refresh/logout use only cookies.
- `onResult({ action, data })` synchronously applies a successful response while
  the lock is held. Tokens are delivered in memory here, not broadcast. Do not
  start another coordinated request or async state application inside this
  callback. Future provider code must apply state here rather than blindly
  setting it after awaiting a returned promise.
- `onSessionChange({ type })` receives only a non-secret cross-tab notification.
  It is not a token source and must not trigger an automatic refresh loop.
- `invalidate()` makes local queued/in-flight results stale; it does not revoke
  server credentials or claim a logout succeeded.
- `dispose()` invalidates results, closes the channel and removes its listener.
  Queued jobs fail before fetch. An already sent request is allowed to settle
  under the lock, since aborting it does not undo a server-side cookie change.

Every request sends credentials, JSON, `X-SDLCFlow-CSRF: 1`, no-store, and rejects
redirects. The base URL follows VITE_API_URL with the same localhost default as
the existing API client. No current API call uses this transport yet.

## Coordination and Stale Work

The exclusive `sdlcflow:cookie-auth:v1` Web Lock covers fetch, JSON parsing,
response validation and synchronous state application. All cookie-changing
actions use the same lock, not just refresh. This follows the browser's
[same-origin lock contract](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
Tabs at different origins do not share this lock. Deployment still requires a
single canonical frontend origin and a compatible cookie layout.

Web Storage contains only `sdlcflow:auth-revision:v1`: an opaque revision and a
boolean recovery marker. It never contains access/refresh tokens, passwords,
user IDs or response data. This is not a localStorage mutex: only Web Locks
provides exclusion. Each queued operation captures the revision and checks it
again after acquiring the lock. Login/logout/account actions advance it before
sending, so older queued work cannot run under a changed account accidentally.
Failed mutations can still make older queued work stale; the UI must handle
that cancellation, not automatically replay the mutation.

BroadcastChannel messages contain only `type` and `revision`, announcing a
session change or need to sign in. Notification delivery can lag; it is not the
correctness mechanism for queued work. Old-revision messages are ignored.
See the [BroadcastChannel lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).
Local generation checks prevent late refresh results from being applied after a
local logout intent, invalidation, account action or disposal.

## Failures and Recovery

- Missing Web Locks, BroadcastChannel, or readable/writable coordination storage
  fails closed with AUTH_COORDINATION_UNAVAILABLE before any auth request. Do
  not fall back to uncoordinated refresh or persist credentials elsewhere.
- AUTH_OPERATION_STALE means queued/in-flight work was superseded; do not apply
  its response or treat it as successful login/logout.
- A network error, invalid response, server 5xx, or terminal refresh error blocks
  further refresh requests using a shared non-secret marker. A consumed token
  might already have rotated even though its response was lost. Fresh successful
  login/signup clears the marker. Ending actions leave refresh blocked.
- HTTP errors retain code, status, retryAfter, resetAt and recoveryRequired.
  429 and ordinary validation/credential failures do not automatically force
  recovery. There are no automatic retries. The caller must respect retry delays.
- Existing in-memory auth state is not erased by this helper. Provider/UI error
  handling, including a sign-in recovery message, belongs to the next slice.

No forced lock timeout or lock stealing is implemented: a paused tab/request can
delay another tab. A browser/process crash can lose a response without running
JavaScript recovery; subsequent replay may require sign-in. This foundation does
not claim to solve every browser crash or blocked-cookie case.

## Review and Next Steps

Run `npm test -- src/__tests__/refreshCoordinator.test.js`, the complete client
suite, lint and build. Unit tests simulate browser APIs; they do not replace real
multi-tab Chrome/Firefox/Safari tests on the final deployment origins.

Provider-owned memory-only access state and bootstrap are now implemented in
opt-in mode. Next: API and socket renewal, account-action call sites, and deliberate client/server
cutover. Retain the current app behavior until both sides are ready together.
