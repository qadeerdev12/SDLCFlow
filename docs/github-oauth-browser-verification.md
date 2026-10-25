# GitHub OAuth Browser Verification

## Scope

`server/scripts/check-github-browser.mjs` joins the real React Profile page,
API client, Express routes, session checks, encrypted account model and MongoDB
state-consumption logic. Only GitHub is simulated. It does not load `.env`, use
real user data, or require provider credentials.

The browser visits `https://github.com/login/oauth/authorize`, but Playwright
fulfills that request with a local fixture. Clicking Authorize or Cancel follows
a cross-site top-level link to the real temporary API callback. Server-side
GitHub fetches are intercepted in this runner only; unexpected fetches fail
closed. No production provider URLs or security controls are overridden.

Temporary MongoDB, API, Vite and browser resources are closed in `finally`.
Cookie/token values are inspected in memory only, never logged or saved as
artifacts. Existing development servers are not reused or stopped.

## Running

Install the normal client/server development dependencies and a Playwright
browser first. Run from `server/`:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:github-browser
PLAYWRIGHT_BROWSER=webkit npm run test:github-browser
```

Without a channel or engine override, the runner uses Playwright Chromium.
Firefox is selectable, but this chunk does not claim a Firefox pass; the earlier
[authentication checks](authentication-browser-verification.md) record a local
Firefox launch limitation. WebKit is not equivalent to testing Safari on an
actual Apple device.

## Assertions

- Profile's Connect GitHub button accepts the binding cookie across local API/UI
  ports and navigates to the provider fixture.
- The binding cookie is HttpOnly, Lax, host-only, Path=/, and expires within ten
  minutes. Its value is absent from app-origin JavaScript cookies and storage.
- The receiving API sees the Lax binding cookie on the cross-site callback, but
  not the Strict refresh cookie. Header observation happens on the server because
  browser automation metadata does not expose it reliably across engines.
- Success persists the encrypted fixture account, returns to Profile, renders
  Disconnect, and removes the binding cookie.
- Restoring the consumed cookie and replaying the callback still fails before a
  second provider exchange. This tests database replay protection independently
  of cookie deletion.
- Cancellation, missing binding cookie, expired state, and logout-everywhere in
  another tab do not exchange a provider code or replace an existing connection.
- A provider failure performs one attempted exchange and preserves the existing
  connection. Backend tests separately verify that this state cannot be reused.
- Callback responses are non-cacheable and carry `Referrer-Policy: no-referrer`.

For failure scenarios, the fixture seeds an existing account after the Profile UI
has loaded. This exercises preservation during an in-flight connect attempt; it
does not imply that the current UI has a separate reconnect-existing button.
Expiry is simulated by aging the isolated database record, not by waiting ten
minutes. No browser security settings are disabled.

## Boundaries And Manual Checks

Verified locally on 2026-10-22: all runner scenarios passed in Chrome
155.0.8059.85 and Playwright WebKit 26.6. Node was v24.16.0. Syntax and diff
whitespace checks also passed. These are local simulated-provider results,
not a staging or real-GitHub sign-off.

These browser checks use loopback HTTP and the development cookie name. Production
Secure/host-prefix cookie attributes are covered by backend tests, but acceptance
and delivery over the final hosted HTTPS origin still need staging verification.
Real GitHub consent, OAuth application settings, token exchange and repository
permissions are not verified by a simulated provider.

Before closing the production OAuth gate, use a dedicated test account and OAuth
application, not a personal connection that must be preserved:

1. Confirm the registered callback exactly matches the staging HTTPS callback.
   Sign in, open Profile and click Connect GitHub. Review the displayed app name
   and requested permissions before authorizing.
2. Return to Profile and confirm the intended GitHub username. Verify a permitted
   repository can be listed without exposing tokens in UI, URLs or logs.
3. On a separate unconnected test account, cancel at GitHub's consent screen.
   Confirm Profile reports cancellation and no account becomes connected.
4. Start authorization, log out everywhere from another app tab, then complete
   authorization. Confirm the connection fails and requires a new login/attempt.
5. In browser cookie tools, confirm the production binding uses
   `__Host-sdlcflow_github_oauth`, Secure, HttpOnly, Lax, Path=/ and no Domain.
   Confirm the refresh cookie remains Strict and successful connection clears
   the binding. Do not copy cookie values into screenshots or issue reports.
6. Repeat the core flow in target browsers and on a real mobile device through
   the deployed HTTPS edge. Record versions and results without credentials.

Account-deletion cleanup, provider token revocation policy, public-demo abuse
controls and hosting review remain separate launch gates.
