# Memory-Only Authentication Provider

Status: implemented behind `AuthProvider mode="memory"`, with provider and
coordinator tests. The application's default is still `legacy`. Do not switch
the live application until token-keyed UI lifetimes are migrated together with
the server. Account-action UI integration and API/socket renewal are implemented for
memory mode; see [Client Token Renewal](client-token-renewal.md).

## Responsibilities and Design Decisions

### Separate Policy from Transport

`MemoryAuthProvider.jsx` owns user, access token, access expiry, loading and error
state. The refresh coordinator owns cookie requests and cross-tab ordering. The
browser owns the HttpOnly cookie; neither module reads its value. Keeping these
responsibilities separate lets API calls, sockets and the UI share one session
instead of each developing an independent refresh policy.

`AuthContext.jsx` chooses between separate provider components. It does not run
both sets of hooks or choose the mode from a request, stored flag or environment
setting. Existing tests and the live app retain the legacy default. The memory
provider never reads, writes or removes the old `token` storage key. Removing that
key and rejecting legacy JWTs are deliberate cutover tasks, not an accidental
side effect of reviewing this provider.

### Restore Identity, Not a Stored Token

At mount, the coordinator requests `/auth/refresh` with cookies. Its synchronous
`onResult` installs the returned token and expiry in memory while the cookie lock
is held. Refresh responses do not contain a user, so the provider then calls
`/auth/me` with the new bearer token. Loading remains active until that read
resolves. Login/signup responses already contain public user details and can
complete immediately; incomplete user data falls back to the same user lookup.

The local variables inside the owning effect track the current token and user
for asynchronous callbacks. React state exposes the rendered snapshot. One
update function keeps both in sync; callbacks do not rely on a render closure's
possibly outdated token value.

### Treat Async Results as Potentially Stale

The provider increments a local version for session replacement, logout intent,
invalidation and new lookups. `/me` results must still match both this version
and the token they checked. A slow response cannot resurrect a logged-out user
or overwrite a new account. This version is only a client race guard; it is not
the server's account-wide `sessionVersion` and is never sent to the server.

Each effect lifetime creates its own coordinator and session-failure subscription.
Cleanup invalidates work, disposes the channel and unsubscribes. This also handles
React StrictMode's development setup-cleanup-setup replay without leaving a
disposed coordinator or duplicate active bootstrap behind.

### Classify Failures Before Choosing a Recovery

| Failure | Provider behavior | Reason |
| --- | --- | --- |
| Missing/revoked refresh cookie | Signed out; sign-in message | No renewable session exists |
| `/me` network/server error | Keep the memory token; offer retry of `/me` only | A read failed; retrying does not rotate cookies |
| Lost/uncertain refresh response | Show sign-in recovery; do not repeat refresh | Rotation may already have committed |
| Refresh 429 | Preserve retry metadata as a local retry deadline | Repeated clicks must not immediately consume more quota |
| Unsupported coordination APIs | Explicit error, no legacy/storage fallback | Silent fallback would discard the security contract |
| Failure from an old access token | Ignore it after token replacement | An older request must not end a new session |

`ProtectedRoute.jsx` shows a Sign in link when `needsSignIn` is true, instead of
offering a retry that cannot recover safely. Ordinary retryable failures still
show Try again. This only affects the new state exposed by the memory provider;
the legacy provider's behavior remains unchanged.

### Make Logout Honest

The memory provider's logout is asynchronous and calls the server through the
coordinator. It clears local state only on confirmed success or authoritative
session invalidation. An ambiguous failure rejects and retains current memory
state rather than claiming server revocation happened. A supplied old token
cannot trigger logout of the current session.

AppHeader awaits logout and displays a pending state or error before navigating.
ProfilePage uses the provider's `updatePassword`, `logoutEverywhere` and
`deleteAccount` actions, rather than combining a direct API call with a second
logout. The legacy provider implements the same interface using existing bearer
endpoints. See [Account Action Integration](account-action-integration.md) for
the socket-revocation race and verification details.

### Handle Other Tabs Without Refresh Storms

A cross-tab change clears stale local identity and offers an explicit session
check, rather than automatically refreshing on every notification. That check
can adopt a newly logged-in cookie. A recovery-required notification instead
asks for sign-in. No credentials are imported from storage or broadcast messages.

## Review and Verification

Read the code in this order:

1. `AuthContext.jsx`: explicit mode selection and unchanged legacy provider.
2. `MemoryAuthProvider.jsx`: ownership, synchronous install, guarded user lookup,
   error classification and cleanup.
3. `ProtectedRoute.jsx`: retry versus sign-in behavior.
4. `memoryAuth.test.jsx`: real coordinator with simulated locks/channel and fetch.

Tests cover bootstrap, StrictMode replay, remount, no credential persistence,
network recovery, rate-limit delay, login/signup, logout failures, late responses,
cross-tab messages and migration compatibility. These are unit/integration tests,
not a claim of real-browser multi-tab verification.

Next: stable session keys, then the coordinated
server/client cutover and real-browser checks. Memory-mode transports intercept
the first explicit expiry rejection for renewal; legacy mode retains its terminal
session-failure behavior.
