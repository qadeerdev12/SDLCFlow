const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';

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
    throw new Error(message);
  }

  return payload;
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
