import supertest from 'supertest';
import { randomUUID } from 'node:crypto';

// Supertest binds temporary servers without a host, then targets 127.0.0.1.
// Some systems allow a different IPv4 listener on an IPv6 wildcard's port.
// Follow the actual listener family so concurrent suites cannot hit that app.
export default function request(app) {
    // Wrap function apps only. Existing servers and URL strings retain their
    // caller-owned request handlers; this helper must not attach extra listeners.
    const marker = typeof app === 'function' ? randomUUID() : null;
    const client = supertest(marker ? (req, res) => {
        res.setHeader('X-SDLCFlow-Test-App', marker);
        app(req, res);
    } : app);
    for (const [method, send] of Object.entries(client)) {
        client[method] = (...args) => {
            const test = send(...args);
            // Supertest has bound a temporary server by this point. Inspect its
            // actual address rather than guessing from the OS or requested host.
            const address = test.app?.address?.();
            if (address?.family === 'IPv6') {
                // Change only the host; retain protocol, port, path and query.
                const url = new URL(test.url);
                url.hostname = '[::1]';
                test.url = url.href;
            }
            // Fail clearly on wrong-app delivery without printing tokens/bodies.
            if (marker) test.expect('X-SDLCFlow-Test-App', marker);
            // Keep the original Test so chaining, callbacks and automatic
            // temporary-server cleanup remain Supertest's responsibility.
            return test;
        };
    }
    return client;
}
