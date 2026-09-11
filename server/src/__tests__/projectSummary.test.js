import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import User from '../models/User.js';
import GitHubAccount from '../models/GitHubAccount.js';
import BoardGitHubIntegration from '../models/BoardGitHubIntegration.js';
import { GitHubApiError } from '../services/githubService.js';

let mongo;
const app = createApp();
const statuses = ['Done', 'In Progress', 'Blocked'];
function provider(value) { return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) }; }
function summaryFor(options) {
  const input = JSON.parse(JSON.parse(options.body).input[0].content);
  const groups = input.tasks || input;
  const result = Object.fromEntries(groups.map((group) => [group.section, group.cards.length ? [{ text: 'Task status summary.', cardIds: [group.cards[0].id] }] : []]));
  if (input.github) result.github = input.github.commits.length ? [{ text: 'Commit reports an API fix.', commitShas: [input.github.commits[0].sha] }] : [];
  return result;
}
beforeAll(async () => {
  process.env.JWT_SECRET = 'summary-test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);
beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
  vi.stubEnv('OPENAI_TASK_DRAFT_MODEL', 'test-model');
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => provider(summaryFor(options))));
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  await Promise.all([Board, Card, User, GitHubAccount, BoardGitHubIntegration].map((model) => model.deleteMany({})));
});

const commitSha = 'a'.repeat(40);
async function linkGitHub(ctx) {
  const account = await GitHubAccount.create({ user: ctx.user._id, githubId: '1', username: 'private-user', accessToken: 'private-token' });
  return BoardGitHubIntegration.create({ board: ctx.board._id, connectedBy: ctx.user._id, githubAccount: account._id,
    repoId: '1', repoOwner: 'team', repoName: 'app', repoFullName: 'team/app', repoUrl: 'https://github.com/team/app', defaultBranch: 'main' });
}
function mockGitHubAndAI(transform = (value) => value, githubCommits = [{ sha: commitSha, commit: { message: 'Fix API\nSECRET_BODY', author: { name: 'SECRET_NAME', email: 'SECRET_EMAIL', date: '2026-09-01T00:00:00Z' } }, html_url: 'https://untrusted.example' }]) {
  fetch.mockImplementation(async (url, options) => {
    if (url.startsWith('https://api.github.com/')) return { ok: true, json: async () => githubCommits };
    return provider(await transform(summaryFor(options), options));
  });
}

describe('opt-in GitHub AI summaries', () => {
  it('surfaces commit timeouts without calling OpenAI and releases the summary limiter', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    await ctx.add();
    fetch.mockRejectedValueOnce(new GitHubApiError('GitHub took too long to respond. Try again shortly.', {
      code: 'GITHUB_TIMEOUT', statusCode: 504,
    }));
    const res = await ctx.send().send({ includeGitHub: true }).expect(504);
    expect(res.body.error.code).toBe('GITHUB_TIMEOUT');
    expect(res.body.data).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('https://api.github.com/');
    await ctx.send().send({ includeGitHub: false }).expect(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('https://api.openai.com/v1/responses');
  });
  it.each(['owner', 'admin', 'member'])('includes cited commits for %s without writes or raw metadata', async (role) => {
    const ctx = await fixture(role);
    await linkGitHub(ctx);
    const card = await ctx.add();
    const before = await BoardGitHubIntegration.findOne({}).lean();
    mockGitHubAndAI();
    const res = await ctx.send().send({ includeGitHub: true }).expect(200);
    expect(res.body.data.summary.github).toMatchObject({ status: 'ready', included: 1, limit: 10,
      bullets: [{ text: 'Commit reports an API fix.', commits: [{ sha: commitSha, title: 'Fix API', htmlUrl: `https://github.com/team/app/commit/${commitSha}` }] }] });
    expect(res.body.data.summary.sections.completed[0].cards[0].id).toBe(card.id);
    const calls = fetch.mock.calls.filter(([url]) => url === 'https://api.openai.com/v1/responses');
    expect(calls).toHaveLength(1);
    for (const secret of ['private-token', 'SECRET_BODY', 'SECRET_NAME', 'SECRET_EMAIL', 'untrusted.example']) {
      expect(calls[0][1].body).not.toContain(secret);
      expect(JSON.stringify(res.body)).not.toContain(secret);
    }
    expect(await BoardGitHubIntegration.findOne({}).lean()).toEqual(before);
  });
  it.each([undefined, false])('does not fetch GitHub unless explicitly enabled (%s)', async (includeGitHub) => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    await ctx.add();
    const res = await ctx.send().send(includeGitHub === undefined ? {} : { includeGitHub }).expect(200);
    expect(res.body.data.summary.github).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect(Array.isArray(JSON.parse(JSON.parse(fetch.mock.calls[0][1].body).input[0].content))).toBe(true);
  });
  it.each(['true', 1, null, {}])('rejects nonboolean opt-in: %j', async (includeGitHub) => {
    const ctx = await fixture();
    await ctx.send().send({ includeGitHub }).expect(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects outsiders before fetching either provider', async () => {
    const ctx = await fixture(null);
    await linkGitHub(ctx);
    await ctx.send().send({ includeGitHub: true }).expect(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('can summarize commits even when there are no eligible tasks', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    mockGitHubAndAI();
    const summary = (await ctx.send().send({ includeGitHub: true }).expect(200)).body.data.summary;
    expect(summary.empty).toBe(false);
    expect(summary.sections).toEqual({ completed: [], inProgress: [], blocked: [] });
    expect(summary.github.bullets).toHaveLength(1);
  });
  it('reports an unlinked project without fabricating GitHub activity', async () => {
    const ctx = await fixture();
    await ctx.add();
    const summary = (await ctx.send().send({ includeGitHub: true }).expect(200)).body.data.summary;
    expect(summary.github).toMatchObject({ status: 'not_linked', included: 0, bullets: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('skips OpenAI when both task and commit samples are empty', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    mockGitHubAndAI(undefined, []);
    const summary = (await ctx.send().send({ includeGitHub: true }).expect(200)).body.data.summary;
    expect(summary.empty).toBe(true);
    expect(summary.github).toMatchObject({ status: 'ready', included: 0, bullets: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown', 'missing', 'empty', 'url', 'tooMany', 'longText', 'wrongTaskSection'])('rejects invalid AI commit output: %s', async (kind) => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    mockGitHubAndAI((value) => {
      if (kind === 'unknown') value.github[0].commitShas = ['other-sha'];
      if (kind === 'missing') value.github[0].commitShas = [];
      if (kind === 'empty') value.github = [];
      if (kind === 'url') value.github[0].htmlUrl = 'https://untrusted.example';
      if (kind === 'tooMany') value.github = Array(4).fill(value.github[0]);
      if (kind === 'longText') value.github[0].text = 'x'.repeat(501);
      if (kind === 'wrongTaskSection') value.completed = [{ text: 'Done', cardIds: [commitSha] }];
      return value;
    });
    expect((await ctx.send().send({ includeGitHub: true }).expect(502)).body.error.code).toBe('AI_UNAVAILABLE');
  });
  it.each(['unlink', 'relink', 'disconnect', 'membership'])('discards summaries when %s occurs during AI generation', async (change) => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    mockGitHubAndAI(async (value) => {
      if (change === 'unlink') await BoardGitHubIntegration.deleteMany({});
      if (change === 'relink') await BoardGitHubIntegration.updateOne({}, { repoName: 'other' });
      if (change === 'disconnect') await GitHubAccount.deleteMany({});
      if (change === 'membership') await Board.updateOne({}, { members: [] });
      return value;
    });
    const res = await ctx.send().send({ includeGitHub: true }).expect(change === 'membership' ? 404 : 409);
    expect(res.body.data).toBeUndefined();
  });
  it('does not discard a summary just because the GitHub panel updated lastSyncedAt', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    mockGitHubAndAI(async (value) => { await BoardGitHubIntegration.updateOne({}, { lastSyncedAt: new Date() }); return value; });
    await ctx.send().send({ includeGitHub: true }).expect(200);
  });
  it('preserves GitHub throttling and does not call OpenAI after a GitHub failure', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    const reset = Math.ceil(Date.now() / 1000) + 180;
    fetch.mockResolvedValue({ ok: false, status: 429, headers: { get: (key) => ({ 'retry-after': '120', 'x-ratelimit-reset': String(reset) })[key] || null }, json: async () => ({ message: 'Limited' }) });
    const res = await ctx.send().send({ includeGitHub: true }).expect(429);
    expect(res.body.error.code).toBe('GITHUB_RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(179);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(181);
    expect(res.body.error.retryAfter).toBe(120);
    expect(res.body.error.resetAt).toBe(new Date(reset * 1000).toISOString());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('labels network failures as GitHub unavailable without exposing raw details', async () => {
    const ctx = await fixture();
    await linkGitHub(ctx);
    fetch.mockRejectedValue(new TypeError('PRIVATE_CONNECTION_DETAILS'));
    const res = await ctx.send().send({ includeGitHub: true }).expect(502);
    expect(res.body.error.code).toBe('GITHUB_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE_CONNECTION_DETAILS');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });
async function fixture(role = 'member') {
  const user = await User.create({ name: 'Alex', email: 'private@example.com', passwordHash: 'unused' });
  const board = await Board.create({ name: 'Private project', owner: user._id, members: role ? [{ user: user._id, role }] : [] });
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  const url = `/api/v1/boards/${board.id}/summary`;
  return { user, board, url, send: () => request(app).post(url).set('Authorization', `Bearer ${token}`),
    add: (values = {}) => Card.create({ board: board._id, list: new mongoose.Types.ObjectId(), title: 'Task', status: 'Done', position: 1, ...values }),
  };
}

describe('project AI summaries', () => {
  it.each(['member', 'admin', 'owner'])('allows %s and returns grounded citations without writes', async (role) => {
    const ctx = await fixture(role);
    const cards = await Promise.all(statuses.map((status) => ctx.add({ title: status, status })));
    const before = await Card.find({}).lean();
    const res = await ctx.send().expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const summary = res.body.data.summary;
    expect(summary.empty).toBe(false);
    for (const [index, key] of ['completed', 'inProgress', 'blocked'].entries()) {
      expect(summary.sections[key][0].cards).toEqual([{ id: cards[index].id, title: statuses[index] }]);
      expect(summary.scope[key]).toEqual({ included: 1, truncated: false });
    }
    expect(await Card.find({}).lean()).toEqual(before);
    const body = fetch.mock.calls[0][1].body;
    expect(body).not.toContain('private@example.com');
    expect(JSON.parse(body).tools).toBeUndefined();
  });
  it('rejects guests and non-members without querying tasks or calling OpenAI', async () => {
    const ctx = await fixture(null);
    const find = vi.spyOn(Card, 'find');
    await request(app).post(ctx.url).expect(401);
    await ctx.send().expect(404);
    expect(find).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not send other projects, Todo/Review tasks, checklist contents or unsliced descriptions', async () => {
    const ctx = await fixture();
    await ctx.add({ description: 'x'.repeat(1000) + 'HIDDEN_TAIL', checklist: [{ title: 'CHECKLIST_SECRET' }] });
    await ctx.add({ board: new mongoose.Types.ObjectId(), title: 'OTHER_PROJECT' });
    await ctx.add({ status: 'Todo', title: 'TODO_TASK' });
    await ctx.add({ status: 'Review', title: 'REVIEW_TASK' });
    await ctx.send().expect(200);
    const body = fetch.mock.calls[0][1].body;
    for (const text of ['HIDDEN_TAIL', 'CHECKLIST_SECRET', 'OTHER_PROJECT', 'TODO_TASK', 'REVIEW_TASK']) expect(body).not.toContain(text);
  });
  it('skips the provider for empty relevant statuses, even without configuration', async () => {
    const ctx = await fixture();
    vi.stubEnv('OPENAI_API_KEY', '');
    await ctx.add({ status: 'Todo' });
    expect((await ctx.send().expect(200)).body.data.summary.empty).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds every section independently and marks partial coverage', async () => {
    const ctx = await fixture();
    for (let i = 0; i < 21; i++) await ctx.add();
    await ctx.add({ status: 'Blocked' });
    const res = await ctx.send().expect(200);
    expect(res.body.data.summary.scope.completed).toEqual({ included: 20, truncated: true });
    expect(res.body.data.summary.scope.blocked).toEqual({ included: 1, truncated: false });
  });
  it.each(['unknown', 'wrongStatus', 'noCitation', 'missingSection', 'emptySection'])('rejects invalid summary citations/shape: %s', async (kind) => {
    const ctx = await fixture();
    const card = await ctx.add();
    fetch.mockImplementation(async (_url, options) => {
      const result = summaryFor(options);
      if (kind === 'unknown') result.completed[0].cardIds = [new mongoose.Types.ObjectId().toString()];
      if (kind === 'wrongStatus') result.blocked = [{ text: 'Not actually blocked', cardIds: [card.id] }];
      if (kind === 'noCitation') result.completed[0].cardIds = [];
      if (kind === 'missingSection') delete result.blocked;
      if (kind === 'emptySection') result.completed = [];
      return provider(result);
    });
    expect((await ctx.send().expect(502)).body.error.code).toBe('AI_UNAVAILABLE');
  });
  it('rechecks access after generation and does not return a revoked project snapshot', async () => {
    const ctx = await fixture();
    await ctx.add();
    fetch.mockImplementation(async (_url, options) => {
      await Board.updateOne({ _id: ctx.board._id }, { members: [] });
      return provider(summaryFor(options));
    });
    const res = await ctx.send().expect(404);
    expect(res.body.data).toBeUndefined();
  });
  it('preserves quota error handling from task drafting', async () => {
    const ctx = await fixture();
    await ctx.add();
    fetch.mockResolvedValue({ status: 429, ok: false, json: async () => ({ error: { type: 'insufficient_quota' } }) });
    const res = await ctx.send().expect(503);
    expect(res.body.error.code).toBe('AI_QUOTA');
    expect(res.body.error.message).toContain('AI project summary');
    expect(res.headers['retry-after']).toBeUndefined();
  });
});
