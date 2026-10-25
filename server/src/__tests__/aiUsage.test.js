// Verifies the database-backed daily AI request allowance, not a dollar budget.
// Disposable MongoDB keeps concurrent reservations real; mocked fetch responses
// exercise provider failures without spending credits or sending task data.

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request, { issueAccess } from './helpers/auth.js';
import { createApp } from '../app.js';
import { aiUsageOptions } from '../config/aiUsage.js';
import { reserveAIRequest } from '../services/aiUsageService.js';
import { generateTaskDraft } from '../services/taskDraftService.js';
import AIUsage from '../models/AIUsage.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import User from '../models/User.js';

let mongo;
const input = { title: 'Test task', brief: 'Test description' };
const output = { description: 'Draft for review.', tag: 'Task', checklist: ['Test it'] };
const response = () => ({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
] }) });
beforeAll(async () => {
  process.env.JWT_SECRET = 'ai-usage-test';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);
beforeEach(() => {
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '3');
  vi.stubEnv('OPENAI_API_KEY', 'test-only');
  vi.stubEnv('OPENAI_TASK_DRAFT_MODEL', 'test-model');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(response));
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function fixture() {
  const user = await User.create({ name: 'Tester', email: `${new mongoose.Types.ObjectId()}@example.test`, passwordHash: 'unused' });
  const board = await Board.create({ name: 'Budget', owner: user._id, members: [{ user: user._id, role: 'owner' }] });
  const card = await Card.create({ board: board._id, list: new mongoose.Types.ObjectId(), title: 'Task', status: 'Done', position: 1000 });
  const token = await issueAccess(user);
  return { board, card, token };
}

it('defaults production to disabled and validates configuration at startup', () => {
  expect(aiUsageOptions({})).toEqual({ enabled: false, dailyLimit: 100 });
  expect(aiUsageOptions({ NODE_ENV: 'production' }).enabled).toBe(false);
  expect(aiUsageOptions({ NODE_ENV: 'development' }).enabled).toBe(true);
  for (const limit of ['0', '-1', '1.5', 'abc', '10001']) {
    expect(() => aiUsageOptions({ AI_DAILY_REQUEST_LIMIT: limit })).toThrow('AI_DAILY_REQUEST_LIMIT');
  }
  vi.stubEnv('AI_ENABLED', 'yes');
  expect(() => createApp()).toThrow('AI_ENABLED');
});

// All callers contend for one UTC-day document. Checking both admissions and
// the saved count catches a read-then-write race that sequential calls would miss.
it('atomically admits only the daily allowance under concurrent requests', async () => {
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => reserveAIRequest()));
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
  expect(results.filter((result) => result.status === 'rejected').every((result) => result.reason.code === 'AI_DAILY_LIMIT')).toBe(true);
  expect((await AIUsage.findOne().lean()).count).toBe(3);
});

it('survives a new database connection and renews the allowance at midnight UTC', async () => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  const today = new Date('2026-10-25T23:59:59Z');
  await reserveAIRequest(today);
  await mongoose.disconnect();
  await mongoose.connect(mongo.getUri());
  await expect(reserveAIRequest(today)).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT', retryAfter: 1, resetAt: '2026-10-26T00:00:00.000Z' });
  await reserveAIRequest(new Date('2026-10-26T00:00:00Z'));
  expect(await AIUsage.countDocuments()).toBe(2);
});

// A failed response may still represent billed provider work. Refunding here
// would allow repeated failures to bypass the application's request allowance.
it.each(['provider failure', 'malformed output'])('counts %s without refunding attempts', async (kind) => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  if (kind === 'provider failure') fetch.mockRejectedValue(new Error('private failure'));
  else fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'incomplete' }) });
  await expect(generateTaskDraft(input)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  await expect(generateTaskDraft(input)).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('fails closed when accounting is unavailable and does not expose database errors', async () => {
  vi.spyOn(AIUsage, 'updateOne').mockRejectedValue(new Error('sensitive database details'));
  await expect(generateTaskDraft(input)).rejects.toMatchObject({ code: 'AI_USAGE_UNAVAILABLE', statusCode: 503 });
  expect(fetch).not.toHaveBeenCalled();
});

it('does not consume an allowance when disabled or missing provider configuration', async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  await expect(generateTaskDraft(input)).rejects.toMatchObject({ code: 'AI_DISABLED' });
  vi.stubEnv('AI_ENABLED', 'true');
  vi.stubEnv('OPENAI_API_KEY', '');
  await expect(generateTaskDraft(input)).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  expect(await AIUsage.countDocuments()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

it('shares one allowance across users, app instances and drafting/summary endpoints', async () => {
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  const first = await fixture();
  await request(createApp()).post(`/api/v1/boards/${first.board.id}/cards/${first.card.id}/draft`)
    .set('Authorization', `Bearer ${first.token}`).send(input).expect(200);
  const second = await fixture();
  const res = await request(createApp()).post(`/api/v1/boards/${second.board.id}/summary`)
    .set('Authorization', `Bearer ${second.token}`).send({}).expect(429);
  expect(res.body.error).toMatchObject({ code: 'AI_DAILY_LIMIT', retryAfter: expect.any(Number), resetAt: expect.any(String) });
  expect(res.headers['retry-after']).toBe(String(res.body.error.retryAfter));
  expect(fetch).toHaveBeenCalledOnce();
  const draft = await request(createApp()).post(`/api/v1/boards/${second.board.id}/cards/${second.card.id}/draft`)
    .set('Authorization', `Bearer ${second.token}`).send(input).expect(429);
  expect(draft.body.error.code).toBe('AI_DAILY_LIMIT');
  expect(draft.headers['retry-after']).toBe(String(draft.body.error.retryAfter));
});

it('blocks both endpoints while disabled, before optional GitHub requests', async () => {
  vi.stubEnv('AI_ENABLED', 'false');
  const ctx = await fixture();
  const app = createApp();
  for (const [path, body] of [
    [`cards/${ctx.card.id}/draft`, input], ['summary', { includeGitHub: true }],
  ]) {
    const res = await request(app).post(`/api/v1/boards/${ctx.board.id}/${path}`)
      .set('Authorization', `Bearer ${ctx.token}`).send(body).expect(503);
    expect(res.body.error.code).toBe('AI_DISABLED');
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(await AIUsage.countDocuments()).toBe(0);
});

it('does not reserve attempts for unauthorized, invalid or empty-summary requests', async () => {
  const ctx = await fixture();
  const app = createApp();
  const path = `/api/v1/boards/${ctx.board.id}/cards/${ctx.card.id}/draft`;
  await request(app).post(path).send(input).expect(401);
  await request(app).post(path).set('Authorization', `Bearer ${ctx.token}`).send({ title: '', brief: '' }).expect(400);
  await Card.deleteMany({ board: ctx.board._id });
  const summary = await request(app).post(`/api/v1/boards/${ctx.board.id}/summary`)
    .set('Authorization', `Bearer ${ctx.token}`).send({}).expect(200);
  expect(summary.body.data.summary.empty).toBe(true);
  expect(await AIUsage.countDocuments()).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not reset already-used allowance when the configured limit changes', async () => {
  await reserveAIRequest();
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '1');
  await expect(reserveAIRequest()).rejects.toMatchObject({ code: 'AI_DAILY_LIMIT' });
  vi.stubEnv('AI_DAILY_REQUEST_LIMIT', '2');
  await reserveAIRequest();
  expect((await AIUsage.findOne().lean()).count).toBe(2);
});
