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

/** Collect a read-only snapshot without consuming it in another service. */
export async function collectProjectGitHubContext(options) {
  return withProjectGitHubContext(options, async (context) => context);
}

/** Keep credentials private while checking access around asynchronous consumption. */
export async function withProjectGitHubContext({ boardId, userId }, consume) {
  await requireProjectAccess(boardId, userId);
  const integration = await BoardGitHubIntegration.findOne({ board: boardId }).lean();
  if (!integration) {
    const result = await consume({ status: 'not_linked', repository: null, commits: [] });
    // The consumer can still be slow (for example, task-only AI generation).
    // An absent repository does not remove the need to recheck project access.
    await requireProjectAccess(boardId, userId);
    return result;
  }

  // Match project GitHub reads: members use the account that linked the repo,
  // never a caller-supplied token, repository, branch, or page size.
  const account = await GitHubAccount.findById(integration.githubAccount).select('+accessToken');
  if (!account?.accessToken) {
    throw new GitHubApiError('Reconnect GitHub before loading project context.', {
      statusCode: 409, code: 'GITHUB_RECONNECT_REQUIRED',
    });
  }
  const accessToken = account.getAccessToken();
  let commits;
  try {
    commits = await fetchGitHubCommits(accessToken, integration.repoOwner, integration.repoName, {
      limit: COMMIT_LIMIT, sha: integration.defaultBranch,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) throw err;
    // Network/body failures belong to GitHub, not OpenAI. Keep raw connection
    // details server-side and preserve the client's explicit task-only fallback.
    throw new GitHubApiError('Could not reach GitHub. Try again shortly.', { code: 'GITHUB_UNAVAILABLE' });
  }
  // Only validated, bounded source records may enter the AI snapshot. Reject the
  // sample rather than silently claiming complete coverage after dropping rows.
  const sample = Array.isArray(commits) ? commits.slice(0, COMMIT_LIMIT) : null;
  if (!sample || sample.some((commit) => !commit
    || typeof commit.sha !== 'string' || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(commit.sha)
    || typeof commit.message !== 'string'
    || (commit.committedAt != null && (typeof commit.committedAt !== 'string'
      || !Number.isFinite(Date.parse(commit.committedAt)))))) {
    throw new GitHubApiError('GitHub returned incomplete commit data. Try again shortly.', { code: 'GITHUB_UNAVAILABLE' });
  }

  // An external request can outlive membership, unlinking, or token rotation.
  // Discard that snapshot instead of returning data from an obsolete link.
  async function assertCurrent() {
    await requireProjectAccess(boardId, userId);
    const currentLink = await BoardGitHubIntegration.findOne({ board: boardId }).lean();
    const currentAccount = await GitHubAccount.findById(account._id).select('+accessToken');
    const linkFields = ['_id', 'githubAccount', 'repoId', 'repoOwner', 'repoName', 'defaultBranch'];
    if (!currentLink || linkFields.some((field) => String(currentLink[field]) !== String(integration[field]))
      || currentAccount?.accessToken !== account.accessToken) {
      throw new GitHubApiError('GitHub connection changed. Try again.', {
        statusCode: 409, code: 'GITHUB_CONTEXT_CHANGED',
      });
    }
  }
  await assertCurrent();

  const repositoryUrl = `https://github.com/${encodeURIComponent(integration.repoOwner)}/${encodeURIComponent(integration.repoName)}`;
  const context = {
    status: 'ready',
    repository: {
      fullName: `${integration.repoOwner}/${integration.repoName}`,
      defaultBranch: integration.defaultBranch || null,
      htmlUrl: repositoryUrl,
    },
    // Explicit projection excludes author identities and raw provider metadata.
    // Titles remain untrusted text; bounds do not make them safe instructions.
    commits: sample.map((commit) => ({
      sha: commit.sha,
      title: commit.message.split(/[\r\n]/, 1)[0].slice(0, 300),
      committedAt: commit.committedAt || null,
      htmlUrl: `${repositoryUrl}/commit/${encodeURIComponent(commit.sha)}`,
    })),
    limit: COMMIT_LIMIT,
    sampledAt: new Date().toISOString(),
  };
  const result = await consume(context);
  await assertCurrent();
  return result;
}
