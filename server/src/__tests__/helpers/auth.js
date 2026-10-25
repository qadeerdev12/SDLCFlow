import supertest from './http.js';
import { createRefreshSession } from '../../services/refreshSessionService.js';
import { createAccessToken } from '../../utils/accessTokens.js';

// Resource/controller tests send the same origin/JSON/CSRF headers as the client.
// CSRF boundary tests use http.js directly so no auth headers are added for them.
// Authorization is never supplied here: each test chooses its user/token, and
// requests without one must still exercise the real unauthenticated response.
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
// Pass a user with sessionVersion selected. The created refresh record belongs
// to the suite's disposable database and must be included in its normal cleanup.
export async function issueAccess(user) {
    return createAccessToken(await createRefreshSession(user)).token;
}
