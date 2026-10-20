# Account Action Integration

Status: implemented in the client, without enabling memory mode in the live app.
Server endpoints and refresh coordinator contracts are unchanged.

## One Interface, Two Migration Modes

Components call `useAuth()` actions:

| Action | Memory provider | Legacy provider |
| --- | --- | --- |
| `logout()` | Coordinated cookie logout | Existing local logout |
| `updatePassword(currentPassword, newPassword)` | Coordinated password mutation | Existing bearer endpoint |
| `logoutEverywhere()` | Coordinated logout-all mutation | Existing bearer endpoint |
| `deleteAccount(password)` | Coordinated account deletion | Existing bearer endpoint |

The provider, not the page, owns credential cleanup. Password changes, logout-all
and deletion already end the server session, so the page must **not** follow them
with another logout request. An unnecessary second request can fail after the
intended action succeeded, misleading the user about the outcome.

AppHeader awaits logout, disables repeated submissions and renders errors in the
account menu. ProfilePage awaits the corresponding provider action, preserving
confirmation dialogs and existing success/error feedback. Immediate ref guards
prevent duplicate clicks before React has rendered the disabled state.

## Expiry Before an Account Action

Password, logout-all and deletion require an access token. If its known expiry
has passed, the memory provider renews it before starting the mutation. After
awaiting renewal, it checks that the owning session has not changed.

The coordinator then serializes the mutation under the existing browser lock,
including credentials and CSRF headers. No account mutation is automatically
replayed. If the token expires between preflight and server validation, the
request rejects; a subsequent explicit submission can renew first. Password
errors retain the session, whereas authoritative invalid/revoked session errors
clear it.

## Socket Revocation Can Arrive First

For a successful account action the server may revoke sockets before its HTTP
response reaches the browser:

1. The provider records which local session epoch owns the ending mutation.
2. A matching session-failure event immediately clears the user and access token.
3. While awaiting that operation's confirmation, it does not invalidate the
   coordinator generation. Otherwise a successful HTTP result would be rejected
   as stale solely because its own socket revocation arrived first.
4. The HTTP response still must pass the coordinator's normal validation.
   Confirmed success resolves; an uncertain response rejects.

A new login or cross-tab session change still invalidates older operations.
Allowing confirmation does not allow an old operation to clear a newer account.
The local epoch is a client race guard, not the server's `sessionVersion`.

## Review and Verification

- `MemoryAuthProvider.jsx`: coordinated actions, expiry preflight, revocation race.
- `AuthContext.jsx`: same action interface for legacy mode.
- `ProfilePage.jsx`: account actions without a second logout.
- `AppHeader.jsx`: awaited logout, pending/error states.
- `memoryAuth.test.jsx`: cookie/header routing, expiry preflight, socket-before-HTTP,
  incorrect passwords and late responses after a new login.
- `authSession.test.jsx`: legacy account actions still clear stored credentials.
- `profileSessions.test.jsx`, `profilePassword.test.jsx`, `headerLogout.test.jsx`:
  confirmation, pending, failure and navigation behavior.

Tests use simulated coordination, fetch and sockets; real-browser verification is
still required. Stable session identity is now implemented; see
[Session UI Lifetime](session-ui-lifetime.md). Next is coordinated server/client
cutover. UI keys preserve drafts during renewal while still resetting private UI
on an account change.
