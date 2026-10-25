// Exercises account-wide revocation on live Socket.IO connections and HTTP.
// Existing rooms, reconnects, in-flight handshakes and idle expiry must all honor
// the current session generation without treating storage outages as logout.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request, { issueAccess } from './helpers/auth.js';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Server } from 'socket.io';
import { io as createClient } from 'socket.io-client';
import { createApp } from '../app.js';
import { configureSockets } from '../socket.js';
import { revokeSocketSessions } from '../services/socketSessionService.js';
import User from '../models/User.js';

let mongo, io;
const clients = [];
const password = 'original passphrase';
beforeAll(async () => {
  process.env.JWT_SECRET = 'socket-session-tests';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);
afterEach(async () => {
  vi.restoreAllMocks();
  clients.splice(0).forEach((socket) => socket.disconnect());
  if (io) await new Promise((resolve) => io.close(resolve));
  io = undefined;
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongo?.stop(); });

async function fixture() {
  const app = createApp();
  const http = createServer(app);
  io = new Server(http);
  app.set('io', io);
  configureSockets(io);
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const user = await User.create({ name: 'Test', email: 'test@example.com', passwordHash: await bcrypt.hash(password, 4) });
  const token = await issueAccess(user);
  const connect = (credential = token) => {
    const socket = createClient(`http://127.0.0.1:${http.address().port}`, {
      auth: { token: credential }, autoConnect: false, reconnection: false, forceNew: true,
    });
    clients.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
      socket.connect();
    });
  };
  const change = () => request(app).patch('/api/v1/auth/password')
    .set('Authorization', `Bearer ${token}`).send({ currentPassword: password, newPassword: 'replacement passphrase' });
  return { app, user, token, connect, change };
}

function ended(socket) {
  const notices = [];
  socket.on('session:invalidated', (notice) => notices.push(notice.code));
  return new Promise((resolve) => socket.once('disconnect', () => resolve(notices)));
}

describe('socket session lifecycle', () => {
  it.each([null, '0', -1, 1.5])('rejects malformed version %j at handshake', async (version) => {
    const ctx = await fixture();
    const token = jwt.sign({ ...jwt.decode(ctx.token), sessionVersion: version }, process.env.JWT_SECRET);
    await expect(ctx.connect(token)).rejects.toMatchObject({ data: { code: 'INVALID_TOKEN' } });
    expect(io.sockets.sockets.size).toBe(0);
  });

  it('revokes all old connections and rooms, rejects reconnect, and allows fresh login', async () => {
    const ctx = await fixture();
    const first = await ctx.connect();
    const second = await ctx.connect();
    const other = await User.create({ name: 'Other', email: 'other@example.com', passwordHash: 'unused' });
    const unrelated = await ctx.connect(await issueAccess(other));
    const board = (await request(ctx.app).post('/api/v1/boards').set('Authorization', `Bearer ${ctx.token}`).send({ name: 'Test project' }).expect(201)).body.data.board;
    expect((await first.timeout(2000).emitWithAck('board:join', { boardId: board._id })).ok).toBe(true);
    const firstEnded = ended(first);
    const secondEnded = ended(second);
    await ctx.change().expect(200);
    expect(await firstEnded).toEqual(['SESSION_INVALIDATED']);
    expect(await secondEnded).toEqual(['SESSION_INVALIDATED']);
    expect(io.sockets.adapter.rooms.has(`user:${ctx.user.id}`)).toBe(false);
    expect(io.sockets.adapter.rooms.has(`board:${board._id}`)).toBe(false);
    expect(io.sockets.sockets.has(unrelated.id)).toBe(true);
    await expect(ctx.connect()).rejects.toMatchObject({ data: { code: 'SESSION_INVALIDATED' } });
    const login = await request(ctx.app).post('/api/v1/auth/login')
      .send({ email: ctx.user.email, password: 'replacement passphrase' }).expect(200);
    const fresh = await ctx.connect(login.body.data.token);
    revokeSocketSessions(io, ctx.user.id, 1);
    expect(io.sockets.sockets.has(fresh.id)).toBe(true);
    expect((await fresh.timeout(2000).emitWithAck('board:join', { boardId: board._id })).data.presence).toHaveLength(1);
  });

  it('disconnects an idle socket when its token expires', async () => {
    const ctx = await fixture();
    const token = jwt.sign({ ...jwt.decode(ctx.token), exp: Math.floor(Date.now() / 1000) + 2 }, process.env.JWT_SECRET);
    const socket = await ctx.connect(token);
    expect(await ended(socket)).toEqual(['SESSION_EXPIRED']);
    expect(io.sockets.adapter.rooms.has(`user:${ctx.user.id}`)).toBe(false);
  });

  it('checks the current database version before dispatching a packet', async () => {
    const ctx = await fixture();
    const socket = await ctx.connect();
    const handler = vi.fn();
    io.sockets.sockets.get(socket.id).on('test:mutation', handler);
    const disconnected = ended(socket);
    await User.updateOne({ _id: ctx.user._id }, { $inc: { sessionVersion: 1 } });
    socket.emit('test:mutation', {});
    expect(await disconnected).toEqual(['SESSION_INVALIDATED']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('invalidates a pending handshake even if its database read returns stale state', async () => {
    const ctx = await fixture();
    let read, release;
    const readDone = new Promise((resolve) => { read = resolve; });
    const paused = new Promise((resolve) => { release = resolve; });
    const originalFind = User.findById.bind(User);
    vi.spyOn(User, 'findById').mockImplementationOnce((...args) => {
      const query = originalFind(...args);
      const exec = query.exec.bind(query);
      query.exec = async () => {
        const staleUser = await exec();
        read();
        await paused;
        return staleUser;
      };
      return query;
    });
    const rejected = expect(ctx.connect()).rejects.toMatchObject({ data: { code: 'SESSION_INVALIDATED' } });
    await readDone;
    try { await ctx.change().expect(200); } finally { release(); }
    await rejected;
    expect(io.sockets.sockets.size).toBe(0);
    expect(io.sockets.adapter.rooms.has(`user:${ctx.user.id}`)).toBe(false);
  });

  it('treats database failures as temporary and blocks the operation without revoking credentials', async () => {
    const ctx = await fixture();
    const socket = await ctx.connect();
    const handler = vi.fn((payload, ack) => ack({ ok: true }));
    io.sockets.sockets.get(socket.id).on('test:mutation', handler);
    vi.spyOn(User, 'findById').mockImplementationOnce(() => { throw new Error('Database unavailable'); });
    const result = await socket.timeout(2000).emitWithAck('test:mutation', {});
    expect(result.error.code).toBe('AUTH_UNAVAILABLE');
    expect(handler).not.toHaveBeenCalled();
    expect(socket.connected).toBe(true);
    expect((await socket.timeout(2000).emitWithAck('test:mutation', {})).ok).toBe(true);
  });

  it('logs out only the authenticated account across REST and sockets without changing its password', async () => {
    const ctx = await fixture();
    const first = await ctx.connect();
    const second = await ctx.connect();
    const other = await User.create({ name: 'Other', email: 'other@example.com', passwordHash: 'unused' });
    const otherToken = await issueAccess(other);
    const otherSocket = await ctx.connect(otherToken);
    const endedFirst = ended(first);
    const endedSecond = ended(second);
    const response = await request(ctx.app).post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${ctx.token}`).send({ userId: other.id, sessionVersion: 99 }).expect(200);
    expect(response.body).toEqual({ data: { loggedOut: true } });
    expect(await endedFirst).toEqual(['SESSION_INVALIDATED']);
    expect(await endedSecond).toEqual(['SESSION_INVALIDATED']);
    const stored = await User.findById(ctx.user._id).select('+sessionVersion +passwordHash');
    expect(stored.sessionVersion).toBe(1);
    expect(stored.passwordHash).toBe(ctx.user.passwordHash);
    expect(io.sockets.sockets.has(otherSocket.id)).toBe(true);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${otherToken}`).expect(200);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ctx.token}`).expect(401);
    await expect(ctx.connect()).rejects.toMatchObject({ data: { code: 'SESSION_INVALIDATED' } });
    const login = await request(ctx.app).post('/api/v1/auth/login').send({ email: ctx.user.email, password }).expect(200);
    const fresh = await ctx.connect(login.body.data.token);
    // A replay from the old generation must not affect this new login.
    await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${ctx.token}`).expect(401);
    expect((await User.findById(ctx.user._id).select('+sessionVersion')).sessionVersion).toBe(1);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);
    expect(io.sockets.sockets.has(fresh.id)).toBe(true);
  });

  it('requires authentication and supports legacy counters without touching other account fields', async () => {
    const ctx = await fixture();
    await request(ctx.app).post('/api/v1/auth/logout-all').expect(401);
    await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', 'Bearer invalid').expect(401);
    await User.collection.updateOne({ _id: ctx.user._id }, { $unset: { sessionVersion: '' } });
    const legacy = jwt.sign({ id: ctx.user.id }, process.env.JWT_SECRET);
    await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${legacy}`).expect(401);
    await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${ctx.token}`).expect(200);
    const stored = await User.findById(ctx.user._id).select('+sessionVersion +passwordHash');
    expect(stored.sessionVersion).toBe(1);
    expect(stored.email).toBe(ctx.user.email);
    expect(stored.passwordHash).toBe(ctx.user.passwordHash);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${legacy}`).expect(401);
  });

  it('preserves sessions if the logout-all database write fails', async () => {
    const ctx = await fixture();
    const socket = await ctx.connect();
    vi.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Database unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${ctx.token}`).expect(500);
    expect((await User.findById(ctx.user._id).select('+sessionVersion')).sessionVersion).toBe(0);
    expect(io.sockets.sockets.has(socket.id)).toBe(true);
    await request(ctx.app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ctx.token}`).expect(200);
  });

  it('increments only once for two overlapping logout-all requests', async () => {
    const ctx = await fixture();
    const originalUpdate = User.findOneAndUpdate.bind(User);
    let arrivals = 0, release;
    const barrier = new Promise((resolve) => { release = resolve; });
    vi.spyOn(User, 'findOneAndUpdate').mockImplementation((...args) => {
      const query = originalUpdate(...args);
      const exec = query.exec.bind(query);
      query.exec = async () => {
        if (++arrivals === 2) release();
        await barrier;
        return exec();
      };
      return query;
    });
    const attempt = () => request(ctx.app).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${ctx.token}`);
    const responses = await Promise.all([attempt(), attempt()]);
    expect(responses.map((result) => result.status).sort()).toEqual([200, 401]);
    expect((await User.findById(ctx.user._id).select('+sessionVersion')).sessionVersion).toBe(1);
  });
});
