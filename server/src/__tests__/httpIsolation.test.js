import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import request from './helpers/http.js';

async function close(server) {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

it('targets the intended IPv6 listener when an IPv4 server owns the same port', async () => {
  const ipv4 = createServer((req, res) => res.end('other app'));
  const ipv6 = createServer((req, res) => res.end('intended app'));
  try {
    ipv4.listen(0, '127.0.0.1');
    await once(ipv4, 'listening');
    // Explicit IPv6-only reproduces the dual-listener situation portably,
    // without relying on the OS selecting colliding ephemeral ports by chance.
    ipv6.listen({ port: ipv4.address().port, host: '::', ipv6Only: true });
    await once(ipv6, 'listening');
    await request(ipv6).get('/').expect(200, 'intended app');
    await request(ipv4).get('/').expect(200, 'other app');
  } finally {
    await close(ipv6);
    await close(ipv4);
  }
});

it('preserves request methods, query strings, headers and bodies for temporary apps', async () => {
  const app = (req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ method: req.method, url: req.url, header: req.headers['x-fixture'], body: JSON.parse(body) }));
    });
  };
  const response = await request(app).post('/path?existing=1').query({ added: 'two words' })
    .set('X-Fixture', 'retained').send({ value: 3 }).expect(200);
  expect(response.body).toEqual({ method: 'POST', url: '/path?existing=1&added=two%20words', header: 'retained', body: { value: 3 } });
});

it('keeps concurrent temporary applications isolated', async () => {
  await Promise.all(Array.from({ length: 30 }, (_, i) =>
    request((req, res) => res.end(String(i))).get('/').expect(200, String(i))));
});
