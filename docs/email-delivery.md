# Email delivery setup

The manual Brevo probe is separate from opt-in recovery and verification delivery.
Neither automatically enables public signup or access restrictions. See
[password recovery](password-recovery.md) and [email verification](email-verification.md)
for their separate flags, origins, endpoints and limits. Both use the same Brevo key
and sender, shared transport safeguards, and independently bounded dispatchers.

## Configure locally

Create a verified sender in Brevo and a restricted API key with Transactional
email access (All); leave unrelated resources at None. Store these values only
in the existing, ignored `server/.env` or server-side host secrets:

```dotenv
BREVO_API_KEY=replace_with_private_key
EMAIL_FROM_NAME=SDLCFlow
EMAIL_FROM_ADDRESS=your_verified_sender@example.com
```

Never use a `VITE_` prefix, commit credentials, or paste keys into issue reports.
Shell environment variables override the file. No SMTP key or new package is needed.

Recovery delivery additionally requires `PASSWORD_RECOVERY_ENABLED=true` and
`PASSWORD_RESET_ORIGIN` (the exact app origin, also in `CLIENT_ORIGIN`, without a
trailing slash). The reset page is now implemented; enable delivery only for
controlled tests before the public-launch checks are complete.
Production must use the HTTPS application origin on Render, not the landing page
on Vercel. HTTP loopback is allowed only in development/test mode. Enabled invalid
configuration fails startup and auth preflight. Restart after changing settings.

## Send one test

From the repository root, using the pinned Node/npm runtime:

```sh
nvm use
npm --prefix server run check:email -- --send
```

This deliberately sends one fixed message to EMAIL_FROM_ADDRESS itself. Only use
an address you control. It consumes sending quota. Without `--send`, the command
prints usage and exits without reading credentials or contacting Brevo.

The script uses the [Brevo transactional API](https://developers.brevo.com/docs/send-a-transactional-email),
with a ten-second timeout, redirects disabled, and no automatic retries. It never
connects to MongoDB. Tests inject fake fetch and credentials, so CI sends no mail.

HTTP 201 plus a message ID means accepted, not delivered. Check your inbox and
spam folder, then Brevo transactional logs for delivery, rejection, or a bounce.
Record the outcome without sharing credentials or full recipient details.
After a timeout or unexpected response, check logs before retrying: a message
may already have been accepted.

## Troubleshooting and release gate

- 400: check sender verification and configuration.
- 401: check API key validity/expiry; do not substitute an SMTP key.
- An unauthorized outbound IP can also block API calls. Authorize only verified
  development/hosting outbound IPs in Brevo; do not turn off protection as a shortcut.
- 403: check transactional activation, permissions, and authorized IP settings.
- 429: inspect quota/rate limits before another attempt.
- Other failures: inspect provider logs; raw provider bodies are intentionally not logged.

A verified free-email sender is not an authenticated custom domain. Delivery to
your own inbox does not prove delivery to all public users. Before public signup,
verify delivery to other inboxes you control, review sender restrictions and spam
placement, and implement secure expiring single-use recovery/verification tokens.
Do not open signup merely because this probe succeeds.

The key may expire after inactivity as well as its configured expiry. Rotate it
in server secrets when necessary. No live send is part of the automated tests.

## Privacy and delivery review

The sender test was reported delivered to spam, with a Brevo-rewritten sender.
That is delivery evidence, not evidence of acceptable public inbox placement.

Recovery emails contain short-lived bearer secrets. Brevo necessarily receives
their content. Restrict dashboard access and review message-preview retention.
The recovery service sends plain text and places the token in a URL fragment,
which avoids sending it in the initial request to our app. This does not hide
the token from the mail provider or guarantee that links will not be rewritten.
Brevo documents default click/open tracking; anonymization is not disabling it.
Inspect a delivered recovery message and resolve tracking/retention concerns
before public use. Do not assume unsupported tracking headers disable tracking.
Reference: [Brevo tracking documentation](https://help.brevo.com/hc/en-us/articles/11643306229906-Can-I-anonymize-the-tracking-of-opens-and-clicks-for-my-emails).
