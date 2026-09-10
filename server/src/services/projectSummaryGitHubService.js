import BoardGitHubIntegration from '../models/BoardGitHubIntegration.js';
import GitHubAccount from '../models/GitHubAccount.js';
import { getBoardIfRole } from '../utils/boardAccess.js';
import { fetchGitHubCommits, GitHubApiError } from './githubService.js';

const COMMIT_LIMIT = 10;
const READ_ROLES = ['owner', 'admin', 'member'];

async function requireProjectAccess(boardId, userId) {
  if (!await getBoardIfRole(boardId, userId, READ_ROLES)) {
    throw new GitHubApiError('Project not found.', { statusCode: 404, code: 'NOT_FOUND' });
  }
}

/** Read-only preparation for future summaries; not yet called by the AI endpoint. */
export async function collectProjectGitHubContext({ boardId, userId }) {
  await requireProjectAccess(boardId, userId);
  const integration = await BoardGitHubIntegration.findOne({ board: boardId }).lean();
  if (!integration) return { status: 'not_linked', repository: null, commits: [] };

  // Match project GitHub reads: members use the account that linked the repo,
  // never a caller-supplied token, repository, branch, or page size.
  const account = await GitHubAccount.findById(integration.githubAccount).select('+accessToken');
  if (!account?.accessToken) {
    throw new GitHubApiError('Reconnect GitHub before loading project context.', {
      statusCode: 409, code: 'GITHUB_RECONNECT_REQUIRED',
    });
  }
  const commits = await fetchGitHubCommits(account.getAccessToken(), integration.repoOwner, integration.repoName, {
    limit: COMMIT_LIMIT, sha: integration.defaultBranch,
  });

  // An external request can outlive membership, unlinking, or token rotation.
  // Discard that snapshot instead of returning data from an obsolete link.
  await requireProjectAccess(boardId, userId);
  const currentLink = await BoardGitHubIntegration.findOne({ board: boardId }).lean();
  const currentAccount = await GitHubAccount.findById(account._id).select('+accessToken');
  const linkFields = ['_id', 'githubAccount', 'repoId', 'repoOwner', 'repoName', 'defaultBranch', 'updatedAt'];
  if (!currentLink || linkFields.some((field) => String(currentLink[field]) !== String(integration[field]))
    || currentAccount?.accessToken !== account.accessToken) {
    throw new GitHubApiError('GitHub connection changed. Try again.', {
      statusCode: 409, code: 'GITHUB_CONTEXT_CHANGED',
    });
  }

  const repositoryUrl = `https://github.com/${encodeURIComponent(integration.repoOwner)}/${encodeURIComponent(integration.repoName)}`;
  return {
    status: 'ready',
    repository: {
      fullName: `${integration.repoOwner}/${integration.repoName}`,
      defaultBranch: integration.defaultBranch || null,
      htmlUrl: repositoryUrl,
    },
    // Explicit projection excludes author identities and raw provider metadata.
    // Titles remain untrusted text; bounds do not make them safe instructions.
    commits: commits.slice(0, COMMIT_LIMIT).map((commit) => ({
      sha: commit.sha,
      title: commit.message.split(/\r?\n/, 1)[0].slice(0, 300),
      committedAt: commit.committedAt || null,
      htmlUrl: `${repositoryUrl}/commit/${encodeURIComponent(commit.sha)}`,
    })),
    limit: COMMIT_LIMIT,
    sampledAt: new Date().toISOString(),
  };
}
