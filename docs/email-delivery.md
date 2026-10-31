# Email delivery setup

This first slice is a manual Brevo delivery probe only. It does not implement
password recovery, email verification, or change registration/session behavior.

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
