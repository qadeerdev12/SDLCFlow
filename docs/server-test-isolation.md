# Server Test HTTP Isolation

## Why The Helper Exists

Supertest 7.2.2 starts a temporary server without an explicit host and constructs
an IPv4 `127.0.0.1` request URL. On the tested Mac, an IPv4 loopback listener and
an IPv6 wildcard listener can share a port. A request intended for the wildcard
app can therefore reach the IPv4 app instead. Under parallel tests this can look
like an incorrect auth status or a response from an unrelated controller.

The behavior was reproduced with two controlled listeners on the same port:
raw Supertest received the other app's response. The regression test uses explicit
IPv6-only binding to reproduce the address-family distinction deterministically,
without waiting for random ephemeral-port reuse.

## Writing Tests

- Import `./helpers/http.js` for raw HTTP/security-boundary tests. It preserves
  Supertest's chaining and lifecycle but targets IPv6 loopback when the listener
  is IPv6. It does not inject Origin, CSRF, or authorization headers.
- Import `./helpers/auth.js` for resource/controller tests that need normal
  Origin, JSON and CSRF headers. It delegates to the same transport helper.
- Temporary function apps attach a random test-only response marker. The helper
  asserts it before status assertions, diagnosing wrong-app delivery without
  printing request secrets or response bodies. Production responses are unchanged.
- When manually starting Socket.IO test servers, bind explicitly to `127.0.0.1`
  when constructing IPv4 client URLs. Await listening and close servers/clients
  in cleanup. Do not mix wildcard binding with an assumed IPv4 destination.
- Keep each suite's MongoDB disposable and isolated. The HTTP helper does not
  replace database cleanup, permission checks, or session validation.

`httpIsolation.test.js` covers competing IPv4/IPv6 listeners, concurrent temporary
apps, and preservation of HTTP method, query, headers and JSON body. Run it after
upgrading Supertest or Node. Normal `npm test` keeps parallel execution; disabling
workers or adding retries is not the fix for wrong-app delivery.
