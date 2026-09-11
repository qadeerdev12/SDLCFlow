# Project Summary Verification

## Automated checks

Install both workspace dependency sets from the repository root:

```sh
cd client
npm ci
cd ../server
npm ci
npx playwright install chromium
npm run test:summary-browser
```

Alternatively, with Google Chrome already installed, run from `server/`:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:summary-browser
```

The runner requires permission to open loopback ports and launch a browser and
MongoDB. MongoMemoryServer may download its binary on the first run. On Linux,
Playwright may also need its documented operating-system browser dependencies.
The check intentionally waits through a real ten-second GitHub timeout.

## What it exercises

`server/scripts/check-project-summary.mjs` starts a temporary Vite instance, a
real Express application, and an isolated MongoDB. A test-only Vite entry mounts
the real `ProjectSummaryPanel`; requests use the real `boardApi`, JWT middleware,
controllers, collector, summary service, and output validation.

Only the external GitHub/OpenAI responses are mocked. The provider mock rejects
all unexpected URLs and checks that private fixture metadata is not included in
the AI input. Browser requests are restricted to the two temporary local servers.
Each scenario gets a separate user/project, avoiding cross-scenario rate limits.

The check covers:

- Task-only default, explicit generation, and card source links.
- Opted-in GitHub summaries and commit links at 1440px and 390px widths.
- Sampled branch labels and long task/commit/branch text without horizontal overflow.
- Dark-mode styling and HTML-like source text rendered without creating HTML elements.
- Keyboard containment, Escape, restored trigger focus, and background scroll cleanup.
- Unlinked projects and projects containing commits but no eligible tasks.
- Disconnected GitHub accounts and explicit task-only fallback.
- Secondary rate limits, cooldown expiry, and no automatic retry.
- A real aborted ten-second request with no subsequent OpenAI call.
- Membership revoked during generation, with no private summary returned.

The fixture entry and fixture JSON endpoint exist only in the runner's Vite
plugin. Nothing is added to production routes or authentication. No `.env` file
is loaded by the server runner, no Atlas URI is used, and fake credentials replace
provider keys. Ports, browser, database, and Vite cache are isolated from a running
development app. Cleanup runs on success or assertion failure.

The terminal prints PASS lines and an absolute temporary directory containing
desktop/mobile PNGs. Screenshot inspection is still useful: the automated layout
assertion checks horizontal overflow, not every possible visual defect.

## Regression suites

From `server/`:

```sh
npm test
```

From `client/`:

```sh
npm test
npm run lint
npm run build
```

Focused tests cover source validation, malformed retry metadata, timeout cleanup,
role checks, reference validation, changing source selection during cooldown,
keyboard focus, stale responses, quota errors, and API consent serialization.
Run these suites when changing the shared GitHub parser or summary lifecycle.

## Manual quality review

This is a browser-to-API feature check, not a full-app login/navigation test or a
measurement of live AI quality. It does not contact real providers. Before a
release, use a test project whose contents you are comfortable sending to OpenAI:

1. Open the summary from a real project header and verify task-only generation.
2. Opt into GitHub and compare the prose against actual commit titles and dates.
3. Follow a card citation and confirm the correct workflow/card opens.
4. Follow a commit citation and confirm the correct repository and commit opens.
5. Close/reopen the panel and switch projects; consent and snapshots must reset.
6. Review keyboard navigation, dark mode, and your usual desktop/mobile sizes.

Do not treat valid citations as proof of accurate prose. A commit does not prove
deployment or task completion, and a recent sample is not complete history.
Live generation may incur API charges; automated checks above do not.
