import supertest from 'supertest';
import { createRefreshSession } from '../../services/refreshSessionService.js';
import { createAccessToken } from '../../utils/accessTokens.js';

// Resource/controller tests send the same origin/JSON/CSRF headers as the client.
// CSRF boundary tests deliberately import raw supertest instead of this helper.
export default function request(app) {
    const client = supertest(app);
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options']) {
        const send = client[method].bind(client);
        client[method] = (...args) => send(...args)
            .set('Origin', (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0].trim())
            .set('X-SDLCFlow-CSRF', '1').set('Content-Type', 'application/json');
    }
    return client;
}

// Fixtures exercise actual family validation; never bypass the production guard.
export async function issueAccess(user) {
    return createAccessToken(await createRefreshSession(user)).token;
}
