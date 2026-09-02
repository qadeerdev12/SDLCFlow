import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import GitHubAccount from '../models/GitHubAccount.js';
import BoardGitHubIntegration from '../models/BoardGitHubIntegration.js';
import {
  exchangeCodeForToken,
  fetchGitHubProfile,
  fetchPrimaryGitHubEmail,
  fetchGitHubRepositories,
  revokeGitHubToken,
} from '../services/githubService.js';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_SCOPES = ['read:user', 'user:email', 'repo'];

function githubConfigReady() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID
    && process.env.GITHUB_CLIENT_SECRET
    && process.env.GITHUB_CALLBACK_URL
    && process.env.JWT_SECRET
  );
}

function clientRedirectBase() {
  const explicitUrl = process.env.CLIENT_URL || process.env.CLIENT_ORIGIN?.split(',')[0];
  return explicitUrl || 'http://localhost:5173';
}

function signOAuthState(userId) {
  return jwt.sign(
    {
      purpose: 'github_oauth',
      userId: userId.toString(),
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
}

function verifyOAuthState(state) {
  const payload = jwt.verify(state, process.env.JWT_SECRET);
  if (payload.purpose !== 'github_oauth' || !payload.userId) {
    throw new Error('Invalid OAuth state.');
  }
  return payload;
}

function safeAccountPayload(account) {
  if (!account) return null;

  return {
    id: account._id,
    githubId: account.githubId,
    username: account.username,
    displayName: account.displayName,
    email: account.email,
    avatarUrl: account.avatarUrl,
    profileUrl: account.profileUrl,
    scopes: account.scopes,
    connectedAt: account.connectedAt,
    lastSyncedAt: account.lastSyncedAt,
  };
}

function redirectToClient(res, status) {
  const url = new URL('/profile', clientRedirectBase());
  url.searchParams.set('github', status);
  return res.redirect(url.toString());
}

function sendGitHubError(res, error, fallbackMessage) {
  if (error.code || error.statusCode) {
    return res.status(error.statusCode || 502).json({
      error: {
        code: error.code || 'GITHUB_REQUEST_FAILED',
        message: error.message || fallbackMessage,
        retryAfter: error.retryAfter,
        resetAt: error.resetAt,
      },
    });
  }

  return res.status(502).json({
    error: { code: 'GITHUB_REQUEST_FAILED', message: fallbackMessage },
  });
}

// GET /api/v1/integrations/github/start
// Returns the GitHub authorization URL. The client redirects the browser there
// after this protected request, which keeps the SDLCFlow JWT out of query params.
export async function startGitHubOAuth(req, res) {
  if (!githubConfigReady()) {
    return res.status(500).json({
      error: { code: 'GITHUB_CONFIG_MISSING', message: 'GitHub OAuth is not configured on the server.' },
    });
  }

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', process.env.GITHUB_CALLBACK_URL);
  authorizeUrl.searchParams.set('scope', GITHUB_SCOPES.join(' '));
  authorizeUrl.searchParams.set('state', signOAuthState(req.user._id));

  return res.status(200).json({
    data: {
      authorizationUrl: authorizeUrl.toString(),
      scopes: GITHUB_SCOPES,
    },
  });
}

// GET /api/v1/integrations/github/callback
// GitHub redirects here with a short-lived code. We validate the signed state,
// exchange the code server-side, and attach the GitHub account to the SDLCFlow user.
export async function handleGitHubCallback(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return redirectToClient(res, 'missing_code');
    }

    const { userId } = verifyOAuthState(state);
    const token = await exchangeCodeForToken(code);
    const [profile, primaryEmail] = await Promise.all([
      fetchGitHubProfile(token.accessToken),
      fetchPrimaryGitHubEmail(token.accessToken),
    ]);

    await GitHubAccount.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        githubId: String(profile.id),
        username: profile.login,
        displayName: profile.name || profile.login,
        email: primaryEmail || profile.email,
        avatarUrl: profile.avatar_url,
        profileUrl: profile.html_url,
        accessToken: token.accessToken,
        tokenType: token.tokenType,
        scopes: token.scopes,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );

    return redirectToClient(res, 'connected');
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return redirectToClient(res, 'error');
  }
}

// GET /api/v1/integrations/github/account
// Exposes safe connected-account metadata without returning the OAuth token.
export async function getGitHubAccount(req, res) {
  const account = await GitHubAccount.findOne({ user: req.user._id });

  return res.status(200).json({
    data: {
      account: safeAccountPayload(account),
    },
  });
}

// DELETE /api/v1/integrations/github/account
// Removes SDLCFlow's stored connection and attempts to revoke the GitHub token.
// Local cleanup still succeeds if GitHub is temporarily unavailable.
export async function disconnectGitHubAccount(req, res) {
  const account = await GitHubAccount.findOne({ user: req.user._id }).select('+accessToken');
  let revokeResult = { revoked: false, reason: 'not_connected' };
  let unlinkedProjects = 0;

  if (account) {
    try {
      revokeResult = await revokeGitHubToken(account.getAccessToken());
    } catch (error) {
      console.warn('GitHub token revoke failed; deleting local connection:', error.message);
      revokeResult = { revoked: false, reason: 'github_request_failed' };
    }

    const unlinkResult = await BoardGitHubIntegration.deleteMany({ githubAccount: account._id });
    unlinkedProjects = unlinkResult.deletedCount || 0;
    await account.deleteOne();
  }

  return res.status(200).json({
    data: {
      disconnected: true,
      revoked: revokeResult.revoked,
      unlinkedProjects,
    },
  });
}

// GET /api/v1/integrations/github/repos
// Returns repositories visible to the connected GitHub account. Private repo
// access requires the broader `repo` OAuth scope, so older connections may need
// to reconnect before this endpoint can populate the project repo picker.
export async function getGitHubRepositories(req, res) {
  try {
    const account = await GitHubAccount.findOne({ user: req.user._id }).select('+accessToken');
    if (!account) {
      return res.status(409).json({
        error: { code: 'GITHUB_NOT_CONNECTED', message: 'Connect GitHub before choosing a repository.' },
      });
    }

    if (!account.scopes.includes('repo')) {
      return res.status(403).json({
        error: {
          code: 'GITHUB_REPO_SCOPE_REQUIRED',
          message: 'Reconnect GitHub to allow SDLCFlow to list repositories.',
        },
      });
    }

    const repositories = await fetchGitHubRepositories(account.getAccessToken());
    account.lastSyncedAt = new Date();
    await account.save();

    return res.status(200).json({
      data: {
        repositories,
        lastSyncedAt: account.lastSyncedAt,
      },
    });
  } catch (error) {
    console.error('Get GitHub repositories error:', error);
    return sendGitHubError(res, error, 'Could not load repositories from GitHub.');
  }
}
