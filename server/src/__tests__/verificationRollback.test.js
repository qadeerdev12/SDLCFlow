// Recreate the HTTP/socket app against the same disposable database to rehearse
// startup-policy rollback. This is not a hosted process/proxy lifecycle test.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import request, { issueAccess } from './helpers/auth.js';
import { createApp } from '../app.js';
import { configureSockets } from '../socket.js';
import User from '../models/User.js';

let mongo, app, io, http;
const clients = [];
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect());
  if (io) await new Promise((resolve) => io.close(resolve));
  io = undefined;
  for (const model of Object.values(mongoose.models)) await model.deleteMany({});
  vi.unstubAllEnvs();
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function restart(required) {
  if (io) await new Promise((resolve) => io.close(resolve));
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', String(required));
  app = createApp();
  http = createServer(app);
  io = new Server(http);
  app.set('io', io);
  configureSockets(io, { requireVerification: app.locals.emailVerificationRequired });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
}

function connect(token) {
  const socket = createClient(`http://127.0.0.1:${http.address().port}`, {
    auth: { token }, autoConnect: false, reconnection: false, forceNew: true,
  });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
    socket.connect();
  });
}

it('rolls back and re-enables the startup gate without changing proof, data or other access rules', async () => {
  for (const [key, value] of Object.entries({
    JWT_SECRET: 'verification-rollback-tests', REGISTRATION_MODE: 'restricted',
    EMAIL_VERIFICATION_ENABLED: 'false', PASSWORD_RECOVERY_ENABLED: 'false', AI_ENABLED: 'false',
  })) vi.stubEnv(key, value);
  const owner = await User.create({ name: 'Owner', email: 'owner@example.test', passwordHash: 'unused' });
  const outsider = await User.create({ name: 'Outsider', email: 'outsider@example.test', passwordHash: 'unused' });
  const token = await issueAccess(owner), otherToken = await issueAccess(outsider);
  const boards = () => request(app).get('/api/v1/boards').set('Authorization', `Bearer ${token}`);
  const account = () => User.findById(owner._id).select('+emailVerifiedAt +sessionVersion').lean();

  await restart(false);
  const board = (await request(app).post('/api/v1/boards').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Preserved project' }).expect(201)).body.data.board;
  const before = await account();
  await restart(true);
  await boards().expect(403);
  await expect(connect(token)).rejects.toMatchObject({ data: { code: 'EMAIL_VERIFICATION_REQUIRED' } });

  // Changing the environment alone cannot alter the running policy snapshot.
  vi.stubEnv('EMAIL_VERIFICATION_REQUIRED', 'false');
  await boards().expect(403);
  await expect(connect(token)).rejects.toMatchObject({ data: { code: 'EMAIL_VERIFICATION_REQUIRED' } });

  await restart(false);
  await boards().expect(200);
  const socket = await connect(token);
  expect((await socket.timeout(2000).emitWithAck('board:join', { boardId: board._id })).ok).toBe(true);
  const otherSocket = await connect(otherToken);
  expect((await otherSocket.timeout(2000).emitWithAck('board:join', { boardId: board._id })).ok).toBe(false);
  const denied = await request(app).get(`/api/v1/boards/${board._id}`).set('Authorization', `Bearer ${otherToken}`);
  expect([403, 404]).toContain(denied.status);
  await request(app).get('/api/v1/boards').expect(401);
  expect((await request(app).get('/api/v1/auth/registration').expect(200)).body.data.mode).toBe('restricted');
  const after = await account();
  expect(after.emailVerifiedAt).toBeNull();
  expect(after.sessionVersion).toBe(before.sessionVersion);
  expect(after.email).toBe(before.email);
  expect((await request(app).get(`/api/v1/boards/${board._id}`).set('Authorization', `Bearer ${token}`).expect(200)).body.data.board.name).toBe('Preserved project');

  await restart(true);
  await boards().expect(403);
  await expect(connect(token)).rejects.toMatchObject({ data: { code: 'EMAIL_VERIFICATION_REQUIRED' } });
  // Rollback must not resurrect a revoked session either.
  await User.updateOne({ _id: owner._id }, { $inc: { sessionVersion: 1 } });
  await restart(false);
  await boards().expect(401);
  await expect(connect(token)).rejects.toMatchObject({ data: { code: 'SESSION_INVALIDATED' } });
}, 20_000);
