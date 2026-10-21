import { describe, expect, it } from 'vitest';
import { checkAuthDeployment } from '../config/authDeployment.js';

const production = () => ({ mode: 'production',
    server: { NODE_ENV: 'production', CLIENT_URL: 'https://app.example.com', CLIENT_ORIGIN: 'https://app.example.com' },
    client: { VITE_API_URL: 'https://app.example.com/api/v1', VITE_SOCKET_URL: 'https://app.example.com' },
});

describe('authentication deployment preflight', () => {
    it('matches local runtime defaults and flags the alternate hostname', () => {
        const result = checkAuthDeployment({ mode: 'local' });
        expect(result.frontend).toBe('http://localhost:5173');
        expect(result.api).toBe('http://localhost:5050/api/v1');
        expect(result.refresh).toEqual({ localHttp: true, environment: 'development' });
        expect(result.cookieName).toBe('sdlcflow_refresh_dev');
        expect(result.warnings).toHaveLength(1);
    });
    it('accepts a single consistent local hostname without warnings', () => {
        expect(checkAuthDeployment({ mode: 'local', server: { CLIENT_ORIGIN: 'http://localhost:5173' } }).warnings).toEqual([]);
    });
    it('accepts same-origin HTTPS production routing without insecure cookies', () => {
        const result = checkAuthDeployment(production());
        expect(result.refresh).toEqual({ localHttp: false, environment: 'production' });
        expect(result.cookieName).toBe('__Host-sdlcflow_refresh');
        expect(result.warnings).toEqual([]);
    });
    it('requires an explicit preflight mode', () => {
        expect(() => checkAuthDeployment()).toThrow('Select');
    });
    it('rejects local mode in a production environment', () => {
        expect(() => checkAuthDeployment({ mode: 'local', server: { NODE_ENV: 'production' } })).toThrow('NODE_ENV');
    });
    it.each(['CLIENT_URL', 'CLIENT_ORIGIN', 'VITE_API_URL', 'VITE_SOCKET_URL'])('requires explicit production %s', (key) => {
        const input = production();
        delete input[key.startsWith('VITE_') ? 'client' : 'server'][key];
        expect(() => checkAuthDeployment(input)).toThrow(key);
    });
    it('rejects a localhost/127.0.0.1 frontend/API mismatch', () => {
        expect(() => checkAuthDeployment({ mode: 'local', client: { VITE_API_URL: 'http://127.0.0.1:5050/api/v1' } })).toThrow('same hostname');
    });
    it('requires the frontend origin to appear in credentialed CORS', () => {
        const input = production();
        input.server.CLIENT_ORIGIN = 'https://other.example.com';
        expect(() => checkAuthDeployment(input)).toThrow('exact CLIENT_URL');
    });
    it.each(['https://api.example.com/api/v1', 'https://unrelated.example.org/api/v1'])('requires review for a different API hostname %s', (url) => {
        const input = production();
        input.client.VITE_API_URL = url;
        expect(() => checkAuthDeployment(input)).toThrow('deployment review');
    });
    it.each(['http://app.example.com/api/v1', 'https://app.example.com/wrong', 'https://name:secret@app.example.com/api/v1', 'https://app.example.com/api/v1?secret=x'])('rejects unsafe or incorrect API URL %s', (url) => {
        const input = production();
        input.client.VITE_API_URL = url;
        expect(() => checkAuthDeployment(input)).toThrow();
    });
    it('rejects a socket URL pointing at a different origin', () => {
        const input = production();
        input.client.VITE_SOCKET_URL = 'https://app.example.com:8443';
        expect(() => checkAuthDeployment(input)).toThrow('shared HTTP/Socket.IO');
    });
});
