import { createHash, randomBytes } from 'node:crypto';
import { parse } from 'cookie';
import GitHubOAuthState from '../models/GitHubOAuthState.js';
import User from '../models/User.js';
import { getAccessSessionFamily } from './accessSessionService.js';
import { authRuntimeOptions } from '../config/authRuntime.js';

const LIFETIME_MS = 10 * 60 * 1000;
const validSecret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');

function browserCookie() {
    const { localHttp } = authRuntimeOptions();
    return {
        name: localHttp ? 'sdlcflow_github_oauth_dev' : '__Host-sdlcflow_github_oauth',
        // Lax permits GitHub's cross-site top-level GET callback. This is NOT
        // the refresh cookie and cannot authenticate API requests.
        options: { httpOnly: true, secure: !localHttp, sameSite: 'lax', path: '/' },
    };
}

export async function issueGitHubOAuthState(req, res) {
    const state = randomBytes(32).toString('hex');
    const browserSecret = randomBytes(32).toString('hex');
    await GitHubOAuthState.findOneAndUpdate({ session: req.authSession.sessionId }, {
        stateDigest: digest(state), browserDigest: digest(browserSecret),
        user: req.user._id, sessionVersion: req.authSession.sessionVersion,
        expiresAt: new Date(Date.now() + LIFETIME_MS),
    }, { upsert: true, runValidators: true });
    const { name, options } = browserCookie();
    // Only issue a cookie after persistence succeeds. Neither raw secret is
    // stored in MongoDB; the authorization URL contains no account identity.
    res.cookie(name, browserSecret, { ...options, maxAge: LIFETIME_MS });
    return state;
}

export async function assertGitHubOAuthSession(attempt) {
    const user = await User.findById(attempt.user).select('+sessionVersion').lean();
    if (!user || user.sessionVersion !== attempt.sessionVersion
        || !await getAccessSessionFamily({ sessionId: attempt.session,
            userId: attempt.user, version: attempt.sessionVersion })) {
        throw new Error('GitHub OAuth initiating session is no longer valid');
    }
}

export async function consumeGitHubOAuthState(req, res) {
    const { name, options } = browserCookie();
    const header = req.headers.cookie || '';
    // Ambiguous duplicate cookies are rejected rather than choosing one.
    const occurrences = header.split(';').filter((part) => part.trim().split('=')[0] === name).length;
    const secret = parse(header)[name];
    const state = req.query.state;
    if (occurrences !== 1 || !validSecret(secret) || !validSecret(state)) {
        throw new Error('Invalid GitHub OAuth state');
    }
    // Atomic consumption makes simultaneous callbacks and subsequent replay
    // fail before exchanging any provider code. A wrong browser cannot consume it.
    const attempt = await GitHubOAuthState.findOneAndDelete({
        stateDigest: digest(state), browserDigest: digest(secret), expiresAt: { $gt: new Date() },
    }).lean();
    if (!attempt) throw new Error('Invalid GitHub OAuth state');
    res.clearCookie(name, options);
    await assertGitHubOAuthSession(attempt);
    return attempt;
}
