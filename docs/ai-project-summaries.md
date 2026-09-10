# AI Project Summaries

## First slice

The project header's **Summarize project** button opens a read-only panel. No
request runs on open. **Generate summary** explicitly submits the selected task
data to OpenAI. This uses the existing server `OPENAI_API_KEY` and
`OPENAI_TASK_DRAFT_MODEL`; no new key, model, or permissions are required.

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
Provider input truncates titles to 300 and descriptions to 1000 characters per
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
failures clear it. The panel supports Escape, contained tab navigation, restored
focus on close, loading state, manual retry, empty sections, and partial-coverage
labels. Provider text is rendered as plain text, never interpreted HTML.

## Verification

`server/src/__tests__/projectSummary.test.js` covers roles, privacy/scoping,
empty input, per-status limits, citations, revoked access, and quota errors.
`client/src/__tests__/projectSummary.test.jsx` covers explicit generation, source
links, partial coverage, errors, duplicate clicks, stale responses, and keyboard
focus. Provider calls are mocked; live summary quality remains a manual check.
GitHub activity, scheduled reports, and persisted/shared summaries are deferred.
