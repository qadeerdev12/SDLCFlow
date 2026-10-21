# Authentication Origin Configuration

For the selected single-web-service production layout and current configuration
contract, see [First Deployment Plan](deployment-plan.md). The checker now also
validates production NODE_ENV, exact frontend/API origin including port, optional
GitHub callback routing and proxy allowlist syntax.

> Historical implementation guide. The coordinated cutover is now active in source.
> For current startup, token policy and verification status, see
> [Active Authentication and Cutover](authentication-cutover.md). Earlier opt-in
> and legacy-default statements below describe the pre-cutover stages only.

Status: configuration preflight is available. Neither server nor client entry
point has switched to memory authentication. No secret or local environment file
is changed by the checker.

## Run Before Cutover

From `server/`:

```sh
npm run check:auth-config -- --local
npm run check:auth-config -- --production
```

The command is read-only: it does not start a server, contact a database, make a
network request or enable authentication. It exits nonzero for invalid settings
and prints only validated public URLs, planned cookie options and warnings.

Server settings use `.env` with shell overrides, matching the existing dotenv
startup. Client settings use `.env`, `.env.local`, `.env.development` and
`.env.development.local` for local checks; production substitutes `.production`
for `.development`. Shell variables override those files. URL variable expansion
is deliberately rejected; use explicit values when running this checker.
Custom Vite modes/env directories and already-built deployment bundles are not
inspected. Run against the actual values used by the intended build.

## Local Configuration

Server public settings:

```dotenv
CLIENT_ORIGIN=http://localhost:5173
CLIENT_URL=http://localhost:5173
```

Client public settings:

```dotenv
VITE_API_URL=http://localhost:5050/api/v1
VITE_SOCKET_URL=http://localhost:5050
```

Open `http://localhost:5173`. Do not open the frontend at 127.0.0.1 while sending
API requests to localhost. The current guard rejects cross-site authentication
requests, regardless of whether both frontend hostnames appear in CORS.

Local checks reproduce existing fallback URLs if values are missing, including
the server's two-origin fallback. An additional hostname emits a warning; the
primary frontend/API combination is the one being validated. Example files now
show a single consistent hostname. Existing `.env` files are not rewritten.

For the later local activation, the planned server option is:

```js
createApp({ refresh: { localHttp: true, environment: 'development' } });
```

Local mode is rejected when NODE_ENV is production. These options are a reviewed
server construction decision, not a browser-controlled authentication flag.

## Production Layout

The checker requires explicit HTTPS values and currently accepts only frontend
and API URLs sharing a hostname. For example, a future same-origin reverse proxy
could expose the frontend at `https://YOUR_DOMAIN`, API at
`https://YOUR_DOMAIN/api/v1` and Socket.IO at `https://YOUR_DOMAIN/socket.io`.
`VITE_SOCKET_URL` would be the origin `https://YOUR_DOMAIN`, not the socket path.
The proxy must support both ordinary HTTP and Socket.IO traffic; this checker
does not provision or verify it.

Sibling subdomains can be same-site, but the checker intentionally stops for
review rather than guessing from the last two domain labels. Separate hosting
domains must not be approved by simply weakening SameSite or CSRF protection.
No production domain or hosting topology has been selected by this change.

Production cookie options remain Secure, HttpOnly, SameSite=Strict, host-only,
with the `__Host-` prefix. The checker reuses the actual cookie guard's origin
validation rather than maintaining a second version of that policy.

## Next Review Boundary

Once these settings are confirmed, activate server and client together, remove
stored legacy credentials and reject legacy JWTs. Then test browser restoration,
renewal, revocation, cross-tab behavior and edited drafts. See
[Cutover Readiness](auth-cutover-readiness.md) for the full checklist.
