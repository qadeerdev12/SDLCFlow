# AI Usage Safeguards

Task drafting and project summaries share the provider boundary in
`taskDraftService.js`. Before every OpenAI call it checks `AI_ENABLED`, validates
provider configuration, and reserves one request in MongoDB. No paid calls are
made by the safeguard tests; provider responses are mocked.

## Configuration

- `AI_ENABLED`: `true` or `false`. Unset/empty defaults to true for development/test
  and false for production or unspecified `NODE_ENV`. Production requires explicit
  opt-in even when provider credentials are configured.
- `AI_DAILY_REQUEST_LIMIT`: integer from 1 to 10000, default 100. One allowance
  covers all users, projects, task drafts and summaries sharing the database.
- Invalid settings fail app construction. Restart all API instances after changing
  their environment, keeping their settings and system clocks consistent.

For a private portfolio preview, leave AI disabled until provider billing controls,
alert ownership and the desired request allowance have been reviewed. This change
does not modify local `.env` files, provider accounts or billing settings.

## Accounting

`AIUsage` stores one document per UTC date with only a count and an expiry date.
A unique `_id` identifies the day. Initialization tolerates a concurrent creator;
a conditional atomic increment reserves only while `count < limit`. The counter
persists across restarts and account creation/deletion. Changing the limit does
not reset usage. Old counters expire roughly 30 days after their window ends;
TTL cleanup is not responsible for resetting the current allowance.

Requests rejected by authorization/input validation, disabled AI, missing provider
configuration, and empty summaries consume no daily allowance. Once reserved,
attempts are never refunded: provider errors, invalid output, timeout or process
crash may still incur costs. This can conservatively count an attempt that never
reaches the provider. Database failures stop generation rather than bypassing
accounting. Existing per-user concurrency/minute limits remain process-local.

The switch stops new calls after the updated configuration is active. It does not
cancel already-running calls. Separate databases have separate allowances; multiple
deployments using the same API key need coordinated provider-side controls. Database
rollback or deleting counters can restore allowance, so protect database access.

## Boundaries And Verification

This is a request-volume cap, **not a hard dollar budget**. Input size, model pricing,
and token consumption affect costs. Existing input bounds and the provider's 1800
output-token ceiling remain unchanged. Set provider-side controls and monitoring
separately; do not promise a fixed bill from this request limit alone.

`aiUsage.test.js` covers atomic concurrency, cross-user/cross-feature limits,
persistence, UTC rollover, failure accounting, disabled routes, unavailable
accounting, configuration errors and retry metadata. Existing clients display the
safe server message; no model output, prompts, secrets or user identifiers are
stored in usage counters. Verify enabled/disabled behavior and exhaustion on an
isolated staging database before enabling live AI for visitors.
