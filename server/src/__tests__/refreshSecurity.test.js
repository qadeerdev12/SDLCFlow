import { describe, expect, it } from 'vitest';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { createRefreshSecurity, REFRESH_CSRF_HEADER } from '../middleware/refreshSecurity.js';

const origin = 'https://app.example.com';
const credential = `${'a'.repeat(24)}.${'B'.repeat(43)}`;

function fixture(options = {}) {
    const security = createRefreshSecurity({ origins: [origin], ...options });
    const app = express();
    let calls = 0;
    app.use(cors({ origin: options.origins || [origin], credentials: true }));
    app.post('/auth', security.guard, express.json(), (req, res) => {
        calls++;
        security.setCookie(res, credential, new Date(Date.now() + 60_000));
        res.sendStatus(204);
    });
    app.post('/clear', security.guard, express.json(), (req, res) => {
        security.clearCookie(res);
        res.sendStatus(204);
    });
    return { app, security, calls: () => calls };
}
const send = (app, path = '/auth') => request(app).post(path).set('Origin', origin).set(REFRESH_CSRF_HEADER, '1');

describe('refresh cookie and CSRF infrastructure', () => {
    it('accepts exact origins and sets a host-only secure cookie with absolute expiry', async () => {
        const { app, calls } = fixture();
        const response = await send(app).set('Sec-Fetch-Site', 'same-site').send({}).expect(204);
        expect(calls()).toBe(1);
        const cookie = response.headers['set-cookie'][0];
        for (const flag of ['__Host-sdlcflow_refresh=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Expires=']) expect(cookie).toContain(flag);
        expect(cookie).not.toMatch(/Domain=|Max-Age=/);
        expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each([undefined, 'null', 'https://evil.example.com', `${origin}.evil.com`, `${origin}/`, 'http://app.example.com'])('rejects untrusted origin %s', async (value) => {
        const { app, calls } = fixture();
        const req = request(app).post('/auth').set(REFRESH_CSRF_HEADER, '1');
        if (value !== undefined) req.set('Origin', value);
        const response = await req.send({}).expect(403);
        expect(response.body.error.code).toBe('CSRF_REJECTED');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(calls()).toBe(0);
    });

    it.each([undefined, '0', 'true'])('rejects missing/incorrect custom header %s', async (value) => {
        const { app } = fixture();
        const req = request(app).post('/auth').set('Origin', origin);
        if (value !== undefined) req.set(REFRESH_CSRF_HEADER, value);
        await req.send({}).expect(403);
    });

    it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])('rejects simple content type %s before parsing', async (type) => {
        const { app, calls } = fixture();
        await send(app).set('Content-Type', type).send('payload').expect(403);
        expect(calls()).toBe(0);
    });

    it.each(['cross-site', 'none', 'unexpected'])('rejects fetch metadata %s', async (site) => {
        await send(fixture().app).set('Sec-Fetch-Site', site).send({}).expect(403);
    });

    it('rejects an untrusted request before malformed JSON reaches the parser', async () => {
        await request(fixture().app).post('/auth').set('Content-Type', 'application/json').send('{').expect(403);
    });

    it('clears the same cookie identity without retaining its expiry', async () => {
        const response = await send(fixture().app, '/clear').send({}).expect(204);
        expect(response.headers['set-cookie'][0]).toContain('__Host-sdlcflow_refresh=; Path=/; Expires=Thu, 01 Jan 1970');
        expect(response.headers['set-cookie'][0]).toContain('HttpOnly; Secure; SameSite=Strict');
    });

    it('allows only explicit local mode to use an insecure, non-prefixed cookie', async () => {
        const local = 'http://localhost:5173';
        const { app } = fixture({ origins: [local], localHttp: true, environment: 'development' });
        const response = await request(app).post('/auth').set('Origin', local).set(REFRESH_CSRF_HEADER, '1').send({}).expect(204);
        expect(response.headers['set-cookie'][0]).toContain('sdlcflow_refresh_dev=');
        expect(response.headers['set-cookie'][0]).not.toContain('Secure');
    });

    it.each([
        { localHttp: true, environment: 'production' },
        { localHttp: true, environment: 'staging' },
        { origins: [] }, { origins: ['*'] }, { origins: ['null'] },
        { origins: ['https://*.example.com'] }, { origins: [`${origin}/path`] },
        { origins: ['https://user:password@app.example.com'] },
        { origins: ['http://localhost:5173'] },
        { origins: ['http://app.example.com'], localHttp: true, environment: 'development' },
    ])('fails closed for unsafe configuration %j', (options) => {
        expect(() => fixture(options)).toThrow();
    });

    it('rejects expired/invalid credentials before writing any cookie', () => {
        const security = createRefreshSecurity({ origins: [origin] });
        for (const expiry of [new Date(0), new Date('invalid'), 'tomorrow']) {
            expect(() => security.setCookie({}, credential, expiry)).toThrow();
        }
        expect(() => security.setCookie({}, 'bad', new Date(Date.now() + 10000))).toThrow();
    });

    it('allows trusted preflight and does not authorize untrusted origins via CORS', async () => {
        const { app, calls } = fixture();
        const trusted = await request(app).options('/auth').set('Origin', origin)
            .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', REFRESH_CSRF_HEADER).expect(204);
        expect(trusted.headers['access-control-allow-origin']).toBe(origin);
        expect(trusted.headers['access-control-allow-credentials']).toBe('true');
        const denied = await request(app).options('/auth').set('Origin', 'https://evil.example.com')
            .set('Access-Control-Request-Method', 'POST').expect(204);
        expect(denied.headers['access-control-allow-origin']).toBeUndefined();
        expect(calls()).toBe(0);
    });
});
