const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export class GitHubApiError extends Error {
  constructor(message, { code = 'GITHUB_REQUEST_FAILED', statusCode = 502, retryAfter = null, resetAt = null } = {}) {
    super(message);
    this.name = 'GitHubApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
  }
}

function normalizeScopes(scopeString = '') {
  return scopeString
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function parseGitHubResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || 'GitHub request failed.';
    const remaining = response.headers?.get?.('x-ratelimit-remaining');
    const reset = response.headers?.get?.('x-ratelimit-reset');
    const retryAfter = response.headers?.get?.('retry-after');
    const isRateLimited = response.status === 429 || (response.status === 403 && remaining === '0');

    if (isRateLimited) {
      throw new GitHubApiError('GitHub rate limit reached. Please try again shortly.', {
        code: 'GITHUB_RATE_LIMITED',
        statusCode: 429,
        retryAfter: retryAfter ? Number(retryAfter) : null,
        resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : null,
      });
    }

    throw new GitHubApiError(message, {
      statusCode: response.status >= 500 ? 502 : response.status,
    });
  }

  return payload;
}

export async function revokeGitHubToken(accessToken) {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !accessToken) {
    return { revoked: false, reason: 'missing_config' };
  }

  const credentials = Buffer.from(`${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${GITHUB_API_BASE}/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (response.status === 204 || response.status === 404) {
    return { revoked: response.status === 204 };
  }

  await parseGitHubResponse(response);
  return { revoked: true };
}

export async function exchangeCodeForToken(code) {
  const response = await fetch(GITHUB_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_CALLBACK_URL,
    }),
  });

  const payload = await parseGitHubResponse(response);
  if (payload.error) {
    throw new Error(payload.error_description || payload.error);
  }
  if (!payload.access_token) {
    throw new Error('GitHub did not return an access token.');
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    scopes: normalizeScopes(payload.scope),
  };
}

export async function fetchGitHubProfile(accessToken) {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  return parseGitHubResponse(response);
}

export async function fetchPrimaryGitHubEmail(accessToken) {
  const response = await fetch(`${GITHUB_API_BASE}/user/emails`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const emails = await parseGitHubResponse(response);
  const primaryEmail = emails.find((email) => email.primary && email.verified);
  const verifiedEmail = emails.find((email) => email.verified);

  return primaryEmail?.email || verifiedEmail?.email || null;
}

export async function fetchGitHubRepositories(accessToken) {
  const params = new URLSearchParams({
    affiliation: 'owner,collaborator,organization_member',
    per_page: '100',
    sort: 'updated',
  });
  const response = await fetch(`${GITHUB_API_BASE}/user/repos?${params.toString()}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const repositories = await parseGitHubResponse(response);
  return repositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login,
    private: repo.private,
    htmlUrl: repo.html_url,
    description: repo.description,
    defaultBranch: repo.default_branch,
    language: repo.language,
    updatedAt: repo.updated_at,
  }));
}

export async function fetchGitHubCommits(accessToken, owner, repo, { limit = 10, sha } = {}) {
  const params = new URLSearchParams({
    per_page: String(Math.min(Math.max(limit, 1), 30)),
  });
  if (sha) params.set('sha', sha);

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?${params.toString()}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const commits = await parseGitHubResponse(response);
  return commits.map((item) => ({
    sha: item.sha,
    shortSha: item.sha?.slice(0, 7),
    message: item.commit?.message || '',
    authorName: item.commit?.author?.name || item.author?.login || 'Unknown author',
    authorUsername: item.author?.login || null,
    authorAvatarUrl: item.author?.avatar_url || null,
    committedAt: item.commit?.author?.date || item.commit?.committer?.date,
    htmlUrl: item.html_url,
  }));
}

export async function fetchGitHubRepositoryStats(accessToken, owner, repo) {
  async function searchCount(query) {
    const params = new URLSearchParams({ q: query, per_page: '1' });
    const response = await fetch(`${GITHUB_API_BASE}/search/issues?${params.toString()}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const payload = await parseGitHubResponse(response);
    return payload.total_count || 0;
  }

  const [openPullRequests, openIssues] = await Promise.all([
    searchCount(`repo:${owner}/${repo} is:pr is:open`),
    searchCount(`repo:${owner}/${repo} is:issue is:open`),
  ]);

  return {
    openPullRequests,
    openIssues,
  };
}
