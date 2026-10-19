# Authentication Hardening

## Decision

SDLCFlow will retain self-managed JWT authentication. Supabase Auth migration is
not part of the launch plan. This is a learning and ownership decision, not a
claim that custom authentication is inherently safer than a managed provider.
Use maintained cryptographic libraries, not custom cryptography.

## Slice 1: Input Validation

`server/src/utils/authValidation.js` is the authoritative input boundary used by
registration, login, profile updates, password changes, and account deletion.
Inputs are validated before reaching database filters or password hashing.

| Field | Rule |
| --- | --- |
| Request body | Non-null JSON object, not an array |
| Name | String, at most 100 UTF-16 code units before trimming; non-empty after trimming |
| Email | String, at most 254 UTF-16 code units before trimming; basic address syntax; trimmed and lowercased |
| New password | At least 15 Unicode code points and at most 72 UTF-8 bytes |
| Existing password | Non-empty string, at most 1024 UTF-8 bytes |

The email check validates syntax, not ownership or deliverability. Typed email
validation prevents objects such as `{ "$ne": null }` from becoming query
selectors. Duplicate email conflicts, including unique-index races, return 409.
Other validation failures return 400 with the existing `VALIDATION` error code.

Passwords are never trimmed or normalized. Spaces and Unicode are allowed, with
no required mixture of uppercase, numbers, or symbols. The minimum follows
[OWASP's guidance for accounts without MFA](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls).
The byte maximum avoids [bcrypt's silent truncation beyond 72 bytes](https://github.com/dcodeIO/bcrypt.js#security-considerations).
This bcrypt constraint limits non-ASCII passphrase length; changing the hashing
algorithm or introducing a hash migration is a separate decision.

Login, current-password confirmation, and account deletion deliberately do not
apply the new-password minimum. Existing short passwords continue to work.
Legacy passwords over 72 bytes remain verifiable up to the 1024-byte request
limit, with bcrypt's original truncation semantics. Previously accepted passwords
over 1024 bytes are no longer accepted; recovery support remains a launch blocker.
No existing hashes or accounts are rewritten by this slice.

`client/src/lib/passwordPolicy.js` mirrors the new-password rules for immediate
feedback in registration and profile forms. The server still enforces every rule
for API callers that bypass the UI. Keep both helpers and their boundary tests in
sync when changing the policy. Do not use HTML character limits as a substitute
for UTF-8 byte validation.

Registration no longer logs its response/token. Mutation and login errors log
only fixed operation descriptions, not raw database errors or submitted values.

## Slice 2: Login and Signup Throttling

`server/src/middleware/authRateLimit.js` uses
[express-rate-limit](https://express-rate-limit.mintlify.app/reference/configuration)
with independent IP budgets: 20 login requests per 15 minutes and 10 registration
requests per hour. Successful and failed requests both count. The auth router
runs these guards before JSON parsing, database queries, and bcrypt. Each app
instance owns its limiters; unrelated routes do not consume these budgets.

The library's default key groups IPv6 addresses by /56 to resist trivial address
rotation. Changing the submitted email does not reset an IP's budget. A blocked
request returns HTTP 429, `AUTH_RATE_LIMITED`, a user-facing message, `retryAfter`
seconds, and `resetAt`. Responses include rate-limit headers and `Retry-After`.
The existing client API wrapper preserves the metadata and the auth forms show
the message. There are no automatic retries or account-existence hints.

### Deployment and Proxy Trust

Direct/local access defaults to `trust proxy: false`. Leave
`TRUSTED_PROXY_CIDRS` empty unless the server actually sits behind a proxy.
For deployment, set a comma-separated list of verified proxy IP addresses/CIDRs.
The configuration rejects blanket `true`, hop counts, invalid addresses, and
zero-prefix networks. Only include networks controlled by your infrastructure;
a valid but overly broad CIDR is still unsafe. Do not guess a hosting provider's
proxy range or trust every private network automatically.

[Express resolves the nearest untrusted address](https://expressjs.com/en/guide/behind-proxies/)
from the socket and forwarding chain. Untrusted direct callers cannot rotate
`X-Forwarded-For` to get new quotas. Confirm in staging that different real clients
get separate budgets, same clients share a budget, and forged headers are ignored.
The proxy must sanitize forwarding headers, and direct origin access should be
restricted. Until configured correctly, all visitors behind an untrusted proxy
may share one quota. Resolve the existing proxy dependency advisory before
enabling trusted proxies for public deployment.

### Limitations

Counters are in memory, expire automatically, and reset on server restart.
Multiple server processes do not share quotas. Use a shared store and edge
controls before scaling; this is not distributed brute-force or DDoS protection.
IP-only limits do not stop attacks from many different IPs, and users sharing a
network share a budget. Account-aware risk controls and threshold tuning need
deployment review without introducing easy account-lockout attacks. Password
changes and other authenticated mutations are outside this slice.

## Remaining Slices

1. Session invalidation for password changes and logout across REST and sockets.
2. Token storage, expiration, refresh, and associated CSRF/XSS protections.
3. Password recovery, email verification, and reauthentication for email changes.

JWTs currently still last seven days and the browser still stores them in
localStorage. Changing a password does not yet invalidate previously issued
tokens. This slice is not sufficient for unrestricted public signup.

## Verification

Run `npm test` in both `server` and `client`, then `npm run lint` and
`npm run build` in `client`. Server tests use disposable MongoDB databases.
`authValidation.test.js` covers malformed fields, selector rejection, normalization,
duplicate races, password boundaries, legacy login, and password changes.
`passwordPolicy.test.js` covers matching browser policy boundaries.
Server `authRateLimit.test.js` covers quota boundaries, expiration, retry metadata,
controller bypass, separate route budgets, forged forwarding headers, proxy trust,
and IPv6 grouping. Client `authRateLimit.test.js` verifies retry metadata reaches
the UI without automatic retries. Tests use real middleware with mocked auth
controllers, not real accounts, for quota exhaustion.

Manual review: register with a short password, then a valid passphrase; check that
an existing account still signs in; change its password in Profile; verify old
credentials fail and the new password succeeds. Check that registration does not
print the response or token in browser developer tools.
