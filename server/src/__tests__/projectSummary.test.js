import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import User from '../models/User.js';

let mongo;
const app = createApp();
const statuses = ['Done', 'In Progress', 'Blocked'];
function provider(value) { return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) }; }
function summaryFor(options) {
  const groups = JSON.parse(JSON.parse(options.body).input[0].content);
  return Object.fromEntries(groups.map((group) => [group.section, group.cards.length ? [{ text: 'Task status summary.', cardIds: [group.cards[0].id] }] : []]));
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
  await Promise.all([Board, Card, User].map((model) => model.deleteMany({})));
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
