import BoardGitHubIntegration from '../models/BoardGitHubIntegration.js';
import Activity from '../models/Activity.js';
import GitHubAccount from '../models/GitHubAccount.js';
import { recordActivity } from '../services/activityService.js';
import { fetchGitHubCommits, fetchGitHubRepositoryStats } from '../services/githubService.js';
import { getBoardIfRole } from '../utils/boardAccess.js';

function sendIntegrationError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

function makeError(message, statusCode = 400, code = 'VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function serializeIntegration(integration) {
  if (!integration) return null;

  return {
    id: integration._id,
    board: integration.board,
    connectedBy: integration.connectedBy,
    repoId: integration.repoId,
    repoOwner: integration.repoOwner,
    repoName: integration.repoName,
    repoFullName: integration.repoFullName,
    repoUrl: integration.repoUrl,
    defaultBranch: integration.defaultBranch,
    private: integration.private,
    language: integration.language,
    lastSyncedAt: integration.lastSyncedAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

async function getLinkedIntegrationWithToken(boardId) {
  const integration = await BoardGitHubIntegration.findOne({ board: boardId }).populate({
    path: 'githubAccount',
    select: '+accessToken username',
  });
  if (!integration) {
    throw makeError('Link a GitHub repository before loading GitHub data.', 409, 'GITHUB_REPO_NOT_LINKED');
  }
  if (!integration.githubAccount?.accessToken) {
    throw makeError('Reconnect GitHub before loading GitHub data.', 409, 'GITHUB_RECONNECT_REQUIRED');
  }
  return integration;
}

function normalizeRepositoryPayload(body) {
  const repoId = safeString(body.repoId || body.id);
  const repoFullName = safeString(body.repoFullName || body.fullName);
  const [ownerFromFullName, nameFromFullName] = repoFullName.split('/');
  const repoOwner = safeString(body.repoOwner || body.owner || ownerFromFullName);
  const repoName = safeString(body.repoName || body.name || nameFromFullName);
  const repoUrl = safeString(body.repoUrl || body.htmlUrl);
  const defaultBranch = safeString(body.defaultBranch);
  const language = safeString(body.language);

  if (!repoId) throw makeError('Repository id is required.');
  if (!repoOwner || !repoName) throw makeError('Repository owner and name are required.');
  if (!repoFullName && (!repoOwner || !repoName)) throw makeError('Repository full name is required.');
  if (!repoUrl) throw makeError('Repository URL is required.');

  return {
    repoId,
    repoOwner,
    repoName,
    repoFullName: repoFullName || `${repoOwner}/${repoName}`,
    repoUrl,
    defaultBranch,
    private: Boolean(body.private),
    language,
  };
}

async function recordNewCommitActivities({ req, boardId, integration, commits }) {
  const shas = commits.map((commit) => commit.sha).filter(Boolean);
  if (shas.length === 0) return [];

  const existingActivities = await Activity.find({
    board: boardId,
    action: 'github.commit_synced',
    'metadata.sha': { $in: shas },
  }).select('metadata.sha');
  const existingShas = new Set(existingActivities.map((activity) => activity.metadata?.sha).filter(Boolean));

  // Keep activity useful without flooding the timeline on the first repository sync.
  const newCommits = commits
    .filter((commit) => commit.sha && !existingShas.has(commit.sha))
    .slice(0, 5)
    .reverse();
  const activities = [];

  for (const commit of newCommits) {
    const title = safeString(commit.message.split('\n')[0]) || commit.shortSha;
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId,
      actorId: req.user._id,
      action: 'github.commit_synced',
      targetType: 'integration',
      targetId: integration._id,
      targetTitle: title,
      metadata: {
        provider: 'github',
        repoFullName: integration.repoFullName,
        sha: commit.sha,
        shortSha: commit.shortSha,
        htmlUrl: commit.htmlUrl,
        authorName: commit.authorName,
        authorUsername: commit.authorUsername,
        committedAt: commit.committedAt,
      },
    });
    activities.push(activity);
  }

  return activities;
}

// GET /api/v1/boards/:boardId/integrations/github
// Any board member can see which repo is linked to the project.
export async function getBoardGitHubIntegration(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const integration = await BoardGitHubIntegration.findOne({ board: board._id });
    return res.status(200).json({ data: { integration: serializeIntegration(integration) } });
  } catch (err) {
    console.error('Get board GitHub integration error:', err.message);
    return sendIntegrationError(res, err);
  }
}

// PUT /api/v1/boards/:boardId/integrations/github
// Owners/admins can link or change the repo used by a project.
export async function upsertBoardGitHubIntegration(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const githubAccount = await GitHubAccount.findOne({ user: req.user._id });
    if (!githubAccount) {
      throw makeError('Connect GitHub before linking a repository.', 409, 'GITHUB_NOT_CONNECTED');
    }

    const repo = normalizeRepositoryPayload(req.body);
    const integration = await BoardGitHubIntegration.findOneAndUpdate(
      { board: board._id },
      {
        board: board._id,
        connectedBy: req.user._id,
        githubAccount: githubAccount._id,
        ...repo,
        lastSyncedAt: new Date(),
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'github.repo_linked',
      targetType: 'integration',
      targetId: integration._id,
      targetTitle: integration.repoFullName,
      metadata: { provider: 'github', repoFullName: integration.repoFullName },
    });

    return res.status(200).json({ data: { integration: serializeIntegration(integration), activity } });
  } catch (err) {
    console.error('Upsert board GitHub integration error:', err.message);
    return sendIntegrationError(res, err);
  }
}

// DELETE /api/v1/boards/:boardId/integrations/github
// Owners/admins can unlink the GitHub repo from a project.
export async function deleteBoardGitHubIntegration(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const integration = await BoardGitHubIntegration.findOneAndDelete({ board: board._id });
    let activity = null;
    if (integration) {
      activity = await recordActivity({
        io: req.app.get('io'),
        boardId: board._id,
        actorId: req.user._id,
        action: 'github.repo_unlinked',
        targetType: 'integration',
        targetId: integration._id,
        targetTitle: integration.repoFullName,
        metadata: { provider: 'github', repoFullName: integration.repoFullName },
      });
    }

    return res.status(200).json({ data: { unlinked: Boolean(integration), integration: null, activity } });
  } catch (err) {
    console.error('Delete board GitHub integration error:', err.message);
    return sendIntegrationError(res, err);
  }
}

// GET /api/v1/boards/:boardId/github/commits
// Members can read recent commits for the repo linked to this project. The
// request uses the token from the user who linked the repo, so collaborators do
// not each need to connect GitHub just to view project development activity.
export async function getBoardGitHubCommits(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const integration = await getLinkedIntegrationWithToken(board._id);

    const commits = await fetchGitHubCommits(
      integration.githubAccount.accessToken,
      integration.repoOwner,
      integration.repoName,
      { limit: Number(req.query.limit) || 10, sha: req.query.sha || integration.defaultBranch }
    );

    integration.lastSyncedAt = new Date();
    await integration.save();
    const activities = await recordNewCommitActivities({
      req,
      boardId: board._id,
      integration,
      commits,
    });

    return res.status(200).json({
      data: {
        integration: serializeIntegration(integration),
        commits,
        activities,
        lastSyncedAt: integration.lastSyncedAt,
      },
    });
  } catch (err) {
    console.error('Get board GitHub commits error:', err.message);
    if (err.code || err.statusCode) return sendIntegrationError(res, err);
    return res.status(502).json({
      error: { code: 'GITHUB_REQUEST_FAILED', message: 'Could not load commits from GitHub.' },
    });
  }
}

// GET /api/v1/boards/:boardId/github/stats
// Lightweight project-level GitHub health: open pull requests and open issues.
export async function getBoardGitHubStats(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const integration = await getLinkedIntegrationWithToken(board._id);
    const stats = await fetchGitHubRepositoryStats(
      integration.githubAccount.accessToken,
      integration.repoOwner,
      integration.repoName
    );

    integration.lastSyncedAt = new Date();
    await integration.save();

    return res.status(200).json({
      data: {
        integration: serializeIntegration(integration),
        stats,
        lastSyncedAt: integration.lastSyncedAt,
      },
    });
  } catch (err) {
    console.error('Get board GitHub stats error:', err.message);
    if (err.code || err.statusCode) return sendIntegrationError(res, err);
    return res.status(502).json({
      error: { code: 'GITHUB_REQUEST_FAILED', message: 'Could not load repository stats from GitHub.' },
    });
  }
}
