# Session UI Lifetime

> Historical implementation guide. The coordinated cutover is now active in source.
> For current startup, token policy and verification status, see
> [Active Authentication and Cutover](authentication-cutover.md). Earlier opt-in
> and legacy-default statements below describe the pre-cutover stages only.

Status: implemented for opt-in memory authentication. Legacy mode remains the
application default; this does not perform the server/client authentication cutover.

## Identity Is Not a Credential

An access token rotates during a session. Using that token as a React key causes
React to discard the component subtree, losing drafts, modal state and focus.
`MemoryAuthProvider` now supplies a separate `sessionKey`:

- Bootstrap creates a fresh, random key.
- Same-session refresh retains it.
- Every successful login/signup creates a new key, even for the same user.
- Logout, revocation and cross-tab session changes clear it.
- It is not persisted, broadcast or sent to the server.

This key controls UI lifetime only. JWTs, refresh cookies and server authorization
remain the security boundary. A user ID alone is not sufficient: a new sign-in to
the same account must not revive private UI from an earlier session.

Legacy mode exposes its non-rotating token as the key, preserving existing
behavior. Consumers use `sessionKey ?? token` for compatibility with existing
legacy callers. Memory mode always installs the key alongside its access token.

## Component Boundaries

- BoardPage: project ID plus session key. Navigation to another project or a new
  sign-in resets state; renewal and query-only navigation preserve it.
- ActivityPage: project scope plus session key.
- NotificationBell: pathname plus session key. Renewal replaces the socket but
  retains the open panel and loaded rows during the background fetch.
- CardDetailModal: passes the key to its task-drafting panel, combined with card ID.
- ProfilePage: a keyed inner component clears private forms on session changes.

Transport effects still depend on `token`. Keeping React state does not mean
reusing expired credentials: API reads and socket connections receive the new token.
Existing cleanup and request-version guards still discard obsolete responses.

## Avoid Indirect Resets

Stable keys are insufficient if a reload removes the editor from the tree.
Board renewal now reloads without replacing existing content with the initial
loading skeleton. Initial loading still uses the same skeleton.

Profile renewal refreshes account data without overwriting edited name/email
fields. Its initial load seeds those fields; a new session remounts them. The
notification hook retains its loaded snapshot while renewing transport, resets
orphaned pending indicators, and still clears rows on a failed authoritative read.

## Verification

Automated tests cover key retention/replacement/clearing, unsaved board input,
profile fields, AI panel mount identity, open inbox retention, fresh bearer use
and account-change isolation. Browser APIs and network responses are simulated;
the AI mount-boundary test substitutes a small editor for the AI panel.

Before deployment, verify real-browser rotation while editing cards, AI briefs,
profile fields and chat, including multiple tabs, revocation and reconnects.
Next is the coordinated server/client cutover and legacy credential removal, not
an assumption that these tests alone establish production readiness.

See [Cutover Readiness](auth-cutover-readiness.md) for the full-app server wiring,
deployment-origin constraints and remaining activation steps.
