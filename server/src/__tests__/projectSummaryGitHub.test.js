import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Board from '../models/Board.js';
import GitHubAccount from '../models/GitHubAccount.js';
import BoardGitHubIntegration from '../models/BoardGitHubIntegration.js';
import { fetchGitHubCommits, GitHubApiError } from '../services/githubService.js';
import { collectProjectGitHubContext, withProjectGitHubContext } from '../services/projectSummaryGitHubService.js';

vi.mock('../services/githubService.js', async (importOriginal) => ({
  ...await importOriginal(), fetchGitHubCommits: vi.fn(),
}));
let mongo;
const commit = { sha: 'a'.repeat(40), message: 'Fix API\nPrivate body', committedAt: '2026-09-01T00:00:00Z', authorName: 'Private name', htmlUrl: 'https://untrusted.example' };
beforeAll(async () => {
  process.env.JWT_SECRET = 'github-context-test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);
beforeEach(() => { fetchGitHubCommits.mockResolvedValue([commit]); });
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all([Board, GitHubAccount, BoardGitHubIntegration].map((model) => model.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function fixture(role = 'member') {
  const userId = new mongoose.Types.ObjectId();
  const owner = new mongoose.Types.ObjectId();
  const board = await Board.create({ name: 'Project', owner, members: role ? [{ user: userId, role }] : [] });
  const account = await GitHubAccount.create({ user: owner, githubId: '1', username: 'owner', accessToken: 'secret-token' });
  const link = await BoardGitHubIntegration.create({ board: board._id, connectedBy: owner, githubAccount: account._id,
    repoId: '123', repoOwner: 'team', repoName: 'app', repoFullName: 'team/app', repoUrl: 'https://github.com/team/app', defaultBranch: 'main' });
  return { board, account, link, collect: () => collectProjectGitHubContext({ boardId: board._id, userId }) };
}

describe('project summary GitHub context preparation', () => {
  it.each(['revoked', 'deleted'])('rechecks an unlinked project after consumption: %s', async (change) => {
    const ctx = await fixture();
    await BoardGitHubIntegration.deleteMany({});
    const userId = ctx.board.members[0].user;
    await expect(withProjectGitHubContext({ boardId: ctx.board._id, userId }, async (context) => {
      expect(context.status).toBe('not_linked');
      if (change === 'revoked') await Board.updateOne({ _id: ctx.board._id }, { members: [] });
      else await Board.deleteOne({ _id: ctx.board._id });
      return { private: 'summary' };
    })).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(fetchGitHubCommits).not.toHaveBeenCalled();
  });
  it.each([
    null, {}, [null], [{ ...commit, sha: '../other' }], [{ ...commit, sha: { secret: 'value' } }],
    [{ ...commit, message: { unexpected: 'object' } }], [{ ...commit, committedAt: 'invalid' }],
  ])('rejects malformed commit samples before consumption: %j', async (value) => {
    const ctx = await fixture();
    fetchGitHubCommits.mockResolvedValue(value);
    await expect(ctx.collect()).rejects.toMatchObject({ code: 'GITHUB_UNAVAILABLE', statusCode: 502 });
  });
  it('omits carriage-return message bodies and accepts missing dates', async () => {
    const ctx = await fixture();
    fetchGitHubCommits.mockResolvedValue([{ ...commit, message: 'Title\rPRIVATE_BODY', committedAt: null }]);
    const result = await ctx.collect();
    expect(result.commits[0]).toMatchObject({ title: 'Title', committedAt: null });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY');
  });
  it.each(['owner', 'admin', 'member'])('allows %s using the linking account without changing stored data', async (role) => {
    const ctx = await fixture(role);
    const before = await BoardGitHubIntegration.findById(ctx.link._id).lean();
    const result = await ctx.collect();
    expect(fetchGitHubCommits).toHaveBeenCalledWith('secret-token', 'team', 'app', { limit: 10, sha: 'main' });
    expect(result.status).toBe('ready');
    expect(result.commits).toEqual([{ sha: commit.sha, title: 'Fix API', committedAt: commit.committedAt, htmlUrl: `https://github.com/team/app/commit/${commit.sha}` }]);
    for (const excluded of ['secret-token', 'Private name', 'Private body', 'untrusted.example']) expect(JSON.stringify(result)).not.toContain(excluded);
    expect(await BoardGitHubIntegration.findById(ctx.link._id).lean()).toEqual(before);
  });
  it('rejects non-members before reading credentials or making external calls', async () => {
    const ctx = await fixture(null);
    const lookup = vi.spyOn(GitHubAccount, 'findById');
    await expect(ctx.collect()).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchGitHubCommits).not.toHaveBeenCalled();
    lookup.mockRestore();
  });
  it('returns not_linked without using another project integration', async () => {
    const ctx = await fixture();
    await BoardGitHubIntegration.updateOne({ _id: ctx.link._id }, { board: new mongoose.Types.ObjectId() });
    expect(await ctx.collect()).toEqual({ status: 'not_linked', repository: null, commits: [] });
    expect(fetchGitHubCommits).not.toHaveBeenCalled();
  });
  it('reports disconnected accounts without fetching commits', async () => {
    const ctx = await fixture();
    await GitHubAccount.deleteMany({});
    await expect(ctx.collect()).rejects.toMatchObject({ code: 'GITHUB_RECONNECT_REQUIRED' });
    expect(fetchGitHubCommits).not.toHaveBeenCalled();
  });
  it('bounds the sample and commit titles even if the provider returns extra entries', async () => {
    const ctx = await fixture();
    fetchGitHubCommits.mockResolvedValue(Array.from({ length: 15 }, () => ({ ...commit, message: 'x'.repeat(400) })));
    const result = await ctx.collect();
    expect(result.commits).toHaveLength(10);
    expect(result.commits.every((item) => item.title.length === 300)).toBe(true);
  });
  it('distinguishes an empty linked repository sample from no linked repository', async () => {
    const ctx = await fixture();
    fetchGitHubCommits.mockResolvedValue([]);
    expect(await ctx.collect()).toMatchObject({ status: 'ready', commits: [], repository: { fullName: 'team/app' } });
  });
  it.each(['membership', 'unlink', 'relink', 'disconnect', 'rotate'])('discards pending context after %s changes', async (change) => {
    const ctx = await fixture();
    fetchGitHubCommits.mockImplementation(async () => {
      if (change === 'membership') await Board.updateOne({ _id: ctx.board._id }, { members: [] });
      if (change === 'unlink') await BoardGitHubIntegration.deleteMany({});
      if (change === 'relink') await BoardGitHubIntegration.updateOne({ _id: ctx.link._id }, { repoName: 'other' });
      if (change === 'disconnect') await GitHubAccount.deleteMany({});
      if (change === 'rotate') await GitHubAccount.findOneAndUpdate({ _id: ctx.account._id }, { accessToken: 'new-token' });
      return [commit];
    });
    await expect(ctx.collect()).rejects.toMatchObject({ code: change === 'membership' ? 'NOT_FOUND' : 'GITHUB_CONTEXT_CHANGED' });
  });
  it('preserves rate-limit details instead of claiming there are no commits', async () => {
    const ctx = await fixture();
    const error = new GitHubApiError('Rate limited', { code: 'GITHUB_RATE_LIMITED', statusCode: 429, retryAfter: 60 });
    fetchGitHubCommits.mockRejectedValue(error);
    await expect(ctx.collect()).rejects.toBe(error);
  });
});
