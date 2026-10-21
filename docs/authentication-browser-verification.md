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

## Verified Result and Remaining Work

Chunk 1 passed locally with Chrome 155.0.8059.85. This does not certify other browser
engines, mobile browsers, production HTTPS or a deployed proxy configuration.

Next chunks cover access-token expiry, REST/Socket.IO renewal, room rejoin/refetch,
draft retention, multi-tab coordination and revocation through logout/password
changes/account deletion. Real production Secure/__Host- cookie enforcement and
same-site deployment must also be checked in the deployed HTTPS environment.

Review [the runner](../server/scripts/check-auth-browser.mjs) and
[active authentication design](authentication-cutover.md) together. This iteration
adds regression coverage and documentation; it does not change runtime auth behavior.
