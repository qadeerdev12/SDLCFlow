# AI Project Summaries

## Current UI

The project header's **Summarize project** button opens a read-only panel. No
request runs on open. **Generate summary** explicitly submits the selected task
data to OpenAI. This uses the existing server `OPENAI_API_KEY` and
`OPENAI_TASK_DRAFT_MODEL`; no new key, model, or permissions are required.

**Include recent GitHub commits** is unchecked by default and resets on reopening.
The adjacent disclosure explains the additional transfer: repository name and up
to 10 recent commit titles, SHAs, and dates, excluding bodies, author details, and
source code. Checking the box does not fetch or generate anything. Generating
with it checked adds a separate **Recent GitHub activity** section with the
repository, sample count/time, and external commit links opening in a new tab.

The snapshot spans all project workflows, regardless of the current UI filters:

- Completed: cards whose status is exactly `Done`.
- In progress: exactly `In Progress`.
- Blocked: exactly `Blocked`, never inferred from inactivity or overdue dates.

Each group includes up to 20 most recently updated cards (ID breaks timestamp
ties). The response reports included counts and whether more cards were omitted.
These counts are not project totals. Done is a current status, not a completion
date; this is not a weekly report. Todo and Review are outside this slice.

## Backend boundaries

`POST /api/v1/boards/:boardId/summary` is protected and allows owner/admin/member
roles. `projectSummaryController` checks access before selecting data and again
after generation, returning 404 if access was revoked or the board deleted.
The request body cannot widen the project scope or supply model instructions.

`projectSummaryService` selects only task IDs, titles, descriptions, and statuses.
Task-only provider input truncates titles to 300 and descriptions to 1000 characters per
card. No account names, emails, chat, checklist data, GitHub context, or secrets
from environment variables are added to that input. Descriptions themselves may
contain sensitive information; the panel discloses this transfer before generation.

The shared `generateStructuredOutput` provider boundary in `taskDraftService`
retains strict JSON-schema output, no tools, `store: false`, the 20-second timeout,
1800-token output cap, and safe quota/throttling errors. It follows the official
[Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
The existing draft wrapper and its output validation remain independently tested.

Every summary bullet must cite 1-5 supplied card IDs from its own status group.
Unknown IDs, wrong-status citations, missing citations, malformed sections, or
oversized output reject the whole result. Source link titles come from the
database, not the model. The client builds internal `?card=` links, reusing the
board's existing workflow-switching/deep-link behavior. This validates references,
not the factual accuracy of every generated sentence; users still review sources.

There are no writes, persisted summaries, or socket broadcasts. Empty inputs
return an empty snapshot without contacting OpenAI. Each user gets at most one
in-flight summary and five attempts per minute per server process, separately
from drafting. Neither guard is a global spending cap. Shared quotas/billing
monitoring are needed for a public multi-instance deployment.

## Client lifecycle

`ProjectSummaryPanel` owns generation/error/snapshot state. Closing the panel or
changing the project/account unmounts it and invalidates pending reads. Closing
does not cancel the provider request or any incurred usage. Reopening requires
explicit regeneration. Results are snapshots, not live updates; linked cards can
change or disappear afterward. Existing board access checks still apply on open.

Transient regeneration failures retain the previous dated snapshot. Access
failures and GitHub reconnect/connection-change errors clear it. Changing the
GitHub selection also clears the snapshot to avoid misrepresenting its sources;
selection is disabled during generation. GitHub errors offer **Use tasks only**,
which unchecks the option but requires another explicit Generate click. No retry
or fallback silently sends another paid request. The panel supports Escape,
contained tab navigation (including the checkbox), restored
focus on close, loading state, manual retry, empty sections, and partial-coverage
labels. Provider text is rendered as plain text, never interpreted HTML.

GitHub failures have specific guidance for throttling, timeouts, reconnection,
repository access, connection changes, and temporary unavailability. Rate-limit
responses preserve `retryAfter` seconds and `resetAt` in the JSON error. The UI
reuses `githubRetryAt` and `useRetryCooldown` to choose the later deadline and
disable Generate until then. Missing/invalid timing uses a suggested one-minute
pause, not a guarantee of provider availability. The deadline is captured once
when the request fails; expiry enables manual retry but never makes a request.
Task-only fallback remains available during that pause. This is a panel-local
UX guard, not a server rate limiter; reopening resets it. Non-GitHub AI errors
keep their existing messages and are not described as GitHub throttling.

## Verification

`server/src/__tests__/projectSummary.test.js` covers roles, privacy/scoping,
empty input, per-status limits, citations, revoked access, and quota errors.
`client/src/__tests__/projectSummary.test.jsx` covers explicit generation, source
links, partial coverage, errors, duplicate clicks, stale responses, and keyboard
focus, GitHub consent, source links, empty states, connection changes, and manual
task-only fallback. `projectSummaryApi.test.js` checks the serialized opt-in flag.
Provider calls are mocked; live summary quality remains a manual check.
Scheduled reports and persisted/shared summaries are deferred.

## Opt-in GitHub summaries

The existing summary endpoint now accepts `{ "includeGitHub": true }`. Omitting
this field or passing `false` retains the original task-only request and response.
Non-boolean values return 400. The client sends an explicit boolean matching the
checkbox. Do not silently enable it for existing users.

When opted in, a single OpenAI request receives task groups plus the linked
repository's name and the bounded commit SHA/title/date sample. The response adds
`summary.github` with `status`, `repository`, `sampledAt`, `included`, `limit`, and
`bullets`. Each bullet has `text` and server-resolved `commits` source objects.
The three task sections and their status rules remain unchanged. A commit is not
evidence that a task is Done, deployed, verified, or associated with that commit.

Strict output validation requires at most three GitHub bullets, each with 1-5
known commit SHAs and at most 500 characters. Unknown citations, model-supplied
URLs, or fabricated task citations reject the entire result. This extends the
existing [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
schema and retains application-level citation validation. Valid identifiers do
not guarantee factual accuracy: users must still review the source commits.

No linked repository produces `not_linked` metadata and task-only content. GitHub
failures abort the opted-in request, rather than silently returning an incomplete
summary; callers can retry with GitHub disabled. If only commits exist, they can
still be summarized. If neither sample contains data, OpenAI is not called.
The existing summary limiter, model, timeout, and output budget remain unchanged.

GitHub commit reads have a separate 10-second deadline covering both response
headers and body consumption. The underlying fetch is aborted on expiry and the
API returns 504 `GITHUB_TIMEOUT`. OpenAI is not called after a commit timeout,
and the in-flight summary limiter is released so the user can retry. There is no
automatic retry. The same deadline also applies to the project's GitHub commit
panel because both consumers use `fetchGitHubCommits`; other GitHub endpoints are
unchanged. The timer is cleared on success and on every failure. The summary UI's
existing GitHub error handling offers an explicit task-only fallback.

## GitHub context collection

`collectProjectGitHubContext({ boardId, userId })` in
`server/src/services/projectSummaryGitHubService.js` prepares a read-only snapshot
for read-only consumers. The summary controller uses `withProjectGitHubContext`
to consume this snapshot and check membership/connection both before and after
AI generation. Credentials remain inside that wrapper, never in its callback's
input, the AI prompt, or the response. The client remains task-only by default.

The collector checks project membership before reading the saved repository link
and uses the linking account's encrypted credentials through the existing GitHub
service. All project owner/admin/member roles can read, matching the project
GitHub panel. Callers cannot choose an unrelated repository, token, or page size.
The stored default branch is used, with GitHub's default when absent.

The result contains repository identity, a sample timestamp, and at most 10 recent
commits: SHA, first-line title (300 characters), date, and a server-built GitHub
link. It excludes author identities, commit bodies, and raw API metadata. This is
a recent sample, not a weekly report or complete commit history. Text can still
contain sensitive information or malicious instructions; the UI discloses the
transfer and the AI instructions treat it as untrusted source data.

No link returns `status: not_linked`; a successful fetch returns `status: ready`,
including when its sample is empty. Missing credentials require reconnection.
Provider failures retain their existing error and rate-limit details rather than
being disguised as empty activity. Membership, link, and credentials are checked
again after fetching and after consumption; changes discard the result. Routine
`lastSyncedAt` updates do not invalidate it. This does not cancel an already
running GitHub/OpenAI request or undo data already sent or charges already incurred.
There are no writes, sync timestamp updates, activity entries, or broadcasts.
Only the opted-in summary consumer calls OpenAI, not standalone collection.

`server/src/__tests__/projectSummaryGitHub.test.js` verifies permissions, sample
bounds, output projection, disconnected accounts, stale requests, and throttling
using a temporary database and mocked GitHub calls.
`server/src/__tests__/projectSummary.test.js` additionally exercises opted-in API
requests, unchanged defaults, bounded cited output, commit-only/empty inputs,
provider failures, and revoked access/connections during AI generation. These use
mocked providers, not live GitHub data or paid OpenAI requests.
`server/src/__tests__/githubCommitsTimeout.test.js` uses fake timers to cover
stalled headers/bodies, abort behavior, successful cleanup, and unchanged
rate-limit/network failures. The summary API test verifies timeout propagation,
no OpenAI call, and release of the in-flight limiter.
