# Authentication Browser Verification

## Purpose

Unit tests verify individual decisions; this runner checks whether those decisions
work together in a browser: React startup, CORS, cookies, Web Locks, browser storage,
the API and persisted refresh sessions. It mounts the normal application entry
point, including StrictMode, rather than a test-only authentication screen.

## Run Locally

Install client/server dependencies first. From `server/`:

```sh
npx playwright install chromium
npm run test:auth-browser
```

Alternatively, use an already installed Google Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:auth-browser
```

Select Firefox or WebKit explicitly (no fallback to Chromium):

```sh
npx playwright install firefox webkit
PLAYWRIGHT_BROWSER=firefox npm run test:auth-browser
PLAYWRIGHT_BROWSER=webkit npm run test:auth-browser
```

`PLAYWRIGHT_BROWSER` defaults to `chromium`. `PLAYWRIGHT_CHANNEL` is allowed only
with Chromium; unset it when testing Firefox or WebKit. Each invocation gets its
own temporary database and services. All engines run the same four auth chunks
and the mobile-sized checks below; unsupported capabilities are not skipped.

MongoMemoryServer needs its MongoDB binary cached or permission to download it on
first use. Local listeners and browser subprocesses must be allowed. No running
development server, .env secrets, GitHub connection or OpenAI key is required.

The runner creates a temporary database, API server, available Vite port and isolated
browser contexts. API and Socket.IO URLs point at the test server. HTTP requests
outside these local origins are blocked. Only disposable accounts are created.
Finally blocks close owned processes/connections and delete the temporary Vite
cache. It never connects to Atlas or changes the user's running development servers.
Tokens and cookie values are asserted in memory, never printed or saved as traces.

## Chunk 1 Coverage

- Anonymous dashboard, activity, My Tasks, profile and project routes show login
  without sending protected resource requests.
- Incorrect login does not create a cookie or display the dashboard.
- Correct login and signup enter the correct user's dashboard.
- Reload restores identity through the refresh cookie and rotates that cookie.
- The local cookie is HttpOnly, SameSite=Strict, loopback-only, Path=/ and expires
  within the seven-day family lifetime. Non-Secure is intentional for local HTTP.
- Issued access tokens and refresh-cookie values are absent from localStorage,
  sessionStorage and document.cookie. Non-secret coordination metadata is allowed.
- A legacy localStorage token is removed and is never sent as authorization.
- While identity lookup is pending or returns 503, dashboard content stays hidden.
  Explicit retry recovers using the existing access token without another rotation.
- A refresh 503 shows sign-in recovery; another reload does not replay the refresh.
- Simulated failure to remove legacy storage blocks all API requests.
- No uncaught browser exceptions occur during these scenarios.

The identity and refresh failures are injected at the browser network boundary.
Storage failure is simulated by rejecting legacy-token removal, not by disabling
every storage API in browser settings. All successful auth requests use the real
controllers, database, password verification and session service.

## Chunk 2 Coverage

- An expired REST profile mutation receives the real server's SESSION_EXPIRED
  rejection, refreshes once, then retries successfully. The database contains the
  saved profile name.
- A profile 503 neither refreshes nor retries the mutation, and retains the draft.
- If the retry also receives SESSION_EXPIRED, the client stops after two attempts
  and clears the session instead of looping.
- A genuinely short-lived signed access token expires on connected sockets. The
  real server expiry timer triggers renewal; board and inbox sockets share one
  refresh, old sockets disconnect and a replacement rejoins the board room.
- A list changed directly in the database during the refresh gap, without a
  broadcast, appears after reconnect. This verifies snapshot refetch, not merely
  the connection indicator.
- An unsent chat draft survives renewal. Reconnection does not submit it; an
  explicit send persists exactly one message.
- Expiry during a message packet rejects the mutation without replay. The failed
  message remains available for manual retry, which persists exactly one copy.

### Test Boundaries

[Renewal scenarios](../server/scripts/auth-check/renewal.mjs) live separately from
the runner's server/browser lifecycle. No production auth code is changed.

REST expiry is injected by replacing selected outbound bearer tokens with signed,
already-expired copies of their real session claims. The actual server verifier
returns the rejection. This isolates the REST retry path from the socket timer.
The profile 503 is a simulated network response, not a database outage.

For idle sockets, only the login response's access-token timing is shortened to
12 seconds using the runner's signing key. The refresh cookie, persisted family,
signature verification and expiry timer are real. Renewal is briefly held so the
test can check the draft and insert a missed update before reconnection.

For packet expiry, a test-only catch-all listener moves the server socket's session
deadline into the past immediately before message middleware runs. The real
per-packet guard rejects and disconnects it. This avoids a race with the idle timer
and verifies the acknowledgement failure path deterministically. It is not a
production expiry setting or an authentication bypass.

## Chunk 3 Coverage

[Multi-tab scenarios](../server/scripts/auth-check/multiple-tabs.mjs) open two real
pages in the same isolated browser context. They share cookies, localStorage,
Web Locks and BroadcastChannel, just like two tabs of the application.

- Both tabs reload while the first refresh is held. The browser's Web Lock queue
  shows one holder and one waiter, and only one refresh reaches the network until
  released. Both then restore successfully. The database records two sequential
  rotations and no replay revocation.
- Signing into a different disposable account in one tab removes the other tab's
  old profile and unsaved draft. That tab sends no automatic refresh; explicit
  `Try again` adopts the new account without carrying over the old draft.
- Observed account-change broadcasts contain only the fixed event type and opaque
  revision, not a token, cookie value, user details or form data.
- A real refresh commits on the server, then its browser response is aborted.
  The tab waiting for the lock does not send another refresh. Both tabs require
  sign-in, and reloading both still sends no additional refresh. Database checks
  confirm exactly one rotation and no replay revocation.

### Why Two Tabs Rotate Twice

Same-tab callers share one pending refresh, but tokens are not shared between
tabs. Each tab obtains its own in-memory access token through a serialized refresh.
Web Locks protect the shared cookie; BroadcastChannel invalidates stale identity;
the non-secret revision/blocked marker rejects stale intent and persists recovery
requirements across reloads. The marker is not a replacement for a lock.

Holding/aborting responses and observing channel messages are test-only browser
instrumentation. Locks, broadcasts, cookie rotation and database writes use the
real application code. This verifies active tabs in one Chrome context, not
suspended tabs, browser crashes, every browser engine or separate browser profiles.
The lost-response case uses Playwright to forward the request and then abort the
page response; it does not simulate every possible network or cookie-delivery failure.

## Chunk 4 Coverage

[Account-action scenarios](../server/scripts/auth-check/account-actions.mjs) use
fresh disposable accounts and two independent browser contexts per scenario.
Those contexts have different refresh families, modelling separate devices. The
logout scenario also opens a tab sharing the initiating browser's cookie.

- Ordinary logout clears the initiating browser's cookie, removes protected content
  from its shared tab and disconnects that family's sockets. The other independent
  session retains REST access and its live socket connection.
- Logout-all clears the cookie, increments the account session version and revokes
  both sessions. The password hash remains unchanged and a fresh login succeeds.
- Password change rejects an incorrect current password without invalidating either
  session. A successful change revokes both sessions; the old password fails login
  and the replacement password succeeds.
- Account deletion rejects an incorrect password without deleting the user or
  ending either session. Successful deletion removes the account, refresh records
  and a fixture project owned by that account. A project owned by another user
  survives, with the deleted user's membership removed.
- Cancelling logout-all or deletion confirmation sends no mutation request.
- For every successful action, captured old access tokens are rejected by real REST
  requests and new Socket.IO handshakes. Already-connected affected sockets are
  disconnected, and captured old refresh credentials cannot restore the session.

All actions run through the normal application UI with real controller/database
behavior. Read-only access probes and rejected refresh/handshake probes run from
the test process; credentials stay in memory and are never logged. Database checks
supplement UI assertions rather than replacing them. No real accounts are deleted.

These checks cover successful actions, cancellation and incorrect passwords. They
do not simulate every account-action outage, partial deletion failure, concurrent
destructive action or every related-data cleanup relationship.

## Cross-Browser and Mobile-Sized Coverage

The runner accepts Chromium, Firefox and WebKit. The Vite configuration now uses
`envDir: false` instead of the deprecated `envFile` option, preserving isolation
from real client environment files.

[Mobile-sized checks](../server/scripts/auth-check/mobile.mjs) inspect login and
signup at widths 320, 390 and 768, all with an 844px viewport height. They assert
no page-wide horizontal overflow, that visible form controls fit horizontally,
and that another element does not cover their center after scrolling into view.
At 390px they exercise signup, the profile menu, logout-all confirmation
cancellation and authenticated profile reload. Screenshots are retained in a
printed temporary directory outside the repository, using only disposable data.

These are viewport checks, not full device emulation: touch input, software
keyboards, mobile browser chrome, actual iOS Safari and Android remain unverified.
They cover authentication/profile surfaces, not every responsive project view.

### Results on 2026-10-22

| Engine | Result |
| --- | --- |
| Chrome / Chromium channel | Full four-chunk suite and mobile-sized checks passed |
| Playwright WebKit 26.6 | Full four-chunk suite and mobile-sized checks passed |
| Playwright Firefox 155.0 | Blocked before navigation: browser reports `Could not find profile folder` |

WebKit login/signup screenshots at 320px and the confirmation at 390px were also
visually inspected. Firefox failed with both the default temporary directory and
`TMPDIR=/private/tmp`. This resembles an
[upstream macOS profile-access report](https://github.com/microsoft/playwright/issues/42768),
but the exact local OS cause was not independently established. No privacy
permissions were relaxed, normal browser profiles edited, or browser binaries
patched. Rerun the Firefox command in a supported environment before closing that
verification item. Browser installation succeeded; application tests did not run
in Firefox, so it is neither a pass nor a demonstrated application regression.

## Verified Result and Remaining Work

Chunks 1-4 passed locally with Chrome 155.0.8059.85 and Playwright WebKit 26.6.
Firefox remains blocked as documented above. These checks do not certify real
mobile browsers, production HTTPS or a deployed proxy configuration.

The original four-chunk Chrome sequence is complete; the broader cross-browser
chunk remains open for Firefox. Real production
Secure/__Host- cookie enforcement, same-site deployment and proxy routing still
need verification in the deployed HTTPS environment. Other browser engines and
mobile browsers remain separate checks; this is not production certification.

Review [the runner](../server/scripts/check-auth-browser.mjs) and
[active authentication design](authentication-cutover.md) together. This iteration
adds regression coverage and documentation; it does not change runtime auth behavior.
