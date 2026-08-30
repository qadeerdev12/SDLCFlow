import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'http';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { io as createClient } from 'socket.io-client';
import { Server } from 'socket.io';
import { createApp } from '../app.js';
import { configureSockets } from '../socket.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';

let mongo;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 60_000);

afterEach(async () => {
  await Promise.all([
    Board.deleteMany({}),
    Card.deleteMany({}),
    List.deleteMany({}),
    User.deleteMany({}),
    Activity.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function register(app, name, email) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email, password: 'password123' })
    .expect(201);

  return res.body.data;
}

async function createUser(name, email) {
  const passwordHash = await bcrypt.hash('password123', 4);
  return User.create({ name, email, passwordHash });
}

async function createBoardWithOwner(app, ownerToken, name = 'Roadmap') {
  const res = await request(app)
    .post('/api/v1/boards')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name })
    .expect(201);

  return res.body.data.board;
}

async function createListForBoard(app, token, boardId, title = 'Backlog') {
  const res = await request(app)
    .post(`/api/v1/boards/${boardId}/lists`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title, position: 1000 })
    .expect(201);

  return res.body.data.list;
}

async function addMember(app, ownerToken, boardId, email, role = 'member') {
  const res = await request(app)
    .post(`/api/v1/boards/${boardId}/members`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ email, role })
    .expect(201);

  return res.body.data.members;
}

function emitWithAck(socket, eventName, payload) {
  return new Promise((resolve) => {
    socket.timeout(1000).emit(eventName, payload, (err, response) => {
      if (err) resolve({ ok: false, error: { message: err.message } });
      else resolve(response);
    });
  });
}

async function startSocketServer() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: ['http://localhost:5173'], methods: ['GET', 'POST'] },
  });
  app.set('io', io);
  configureSockets(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();

  return {
    app,
    url: `http://127.0.0.1:${port}`,
    async close() {
      await io.close();
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

function connectSocket(url, token) {
  return createClient(url, {
    auth: token !== undefined ? { token } : {},
    forceNew: true,
    reconnection: false,
  });
}

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function waitForConnectError(socket) {
  return new Promise((resolve) => {
    socket.once('connect_error', resolve);
  });
}

describe.sequential('REST board permissions', () => {
  it('hides private boards from non-members and rejects their mutations', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const outsider = await register(app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(app, owner.token);

    await request(app)
      .get(`/api/v1/boards/${board._id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/boards/${board._id}/lists`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ title: 'Sneaky list', position: 1000 })
      .expect(404);
  });

  it('allows members to change work items but not board settings', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const member = await register(app, 'Member', 'member@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    await addMember(app, owner.token, board._id, member.user.email, 'member');

    await request(app)
      .patch(`/api/v1/boards/${board._id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Member rename' })
      .expect(403);

    const list = await createListForBoard(app, member.token, board._id, 'Doing');
    await request(app)
      .post(`/api/v1/boards/${board._id}/cards`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ listId: list._id, title: 'Ship tests', position: 1000, tag: 'Task', status: 'Todo' })
      .expect(201);

    const activities = await request(app)
      .get(`/api/v1/boards/${board._id}/activities`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200);
    expect(activities.body.data.activities.map((activity) => activity.action)).toContain('card.created');
  });

  it('keeps board activity private to members', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const outsider = await register(app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    await createListForBoard(app, owner.token, board._id);

    await request(app)
      .get(`/api/v1/boards/${board._id}/activities`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);
  });

  it('keeps owner-only actions out of admin hands', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const admin = await register(app, 'Admin', 'admin@example.com');
    const member = await createUser('Member', 'member@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    await addMember(app, owner.token, board._id, admin.user.email, 'admin');

    await request(app)
      .patch(`/api/v1/boards/${board._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Admin rename' })
      .expect(200);

    await request(app)
      .delete(`/api/v1/boards/${board._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(403);

    await request(app)
      .patch(`/api/v1/boards/${board._id}/members/${member._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'admin' })
      .expect(403);
  });
});

describe.sequential('Socket.IO board permissions', () => {
  it('rejects invalid JWTs during the handshake', async () => {
    const server = await startSocketServer();
    const socket = connectSocket(server.url, 'not-a-real-token');

    const err = await waitForConnectError(socket);
    expect(err.message).toBe('Invalid authentication token.');

    socket.disconnect();
    await server.close();
  });

  it('checks membership before joining rooms and mutating cards', async () => {
    const server = await startSocketServer();
    const owner = await register(server.app, 'Owner', 'owner@example.com');
    const outsider = await register(server.app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(server.app, owner.token);
    const list = await createListForBoard(server.app, owner.token, board._id);
    const socket = connectSocket(server.url, outsider.token);
    await waitForConnect(socket);

    const join = await emitWithAck(socket, 'board:join', { boardId: board._id });
    expect(join.ok).toBe(false);
    expect(join.error.code).toBe('NOT_FOUND');

    const create = await emitWithAck(socket, 'card:create', {
      boardId: board._id,
      listId: list._id,
      title: 'Unauthorized card',
      position: 1000,
    });
    expect(create.ok).toBe(false);
    expect(create.error.code).toBe('NOT_FOUND');
    await expect(Card.countDocuments({ board: board._id })).resolves.toBe(0);

    socket.disconnect();
    await server.close();
  });

  it('acks the sender and broadcasts persisted card changes to collaborators', async () => {
    const server = await startSocketServer();
    const owner = await register(server.app, 'Owner', 'owner@example.com');
    const collaborator = await register(server.app, 'Collaborator', 'collab@example.com');
    const board = await createBoardWithOwner(server.app, owner.token);
    const list = await createListForBoard(server.app, owner.token, board._id);
    await addMember(server.app, owner.token, board._id, collaborator.user.email, 'member');

    const ownerSocket = connectSocket(server.url, owner.token);
    const collaboratorSocket = connectSocket(server.url, collaborator.token);
    await Promise.all([waitForConnect(ownerSocket), waitForConnect(collaboratorSocket)]);
    await emitWithAck(ownerSocket, 'board:join', { boardId: board._id });
    await emitWithAck(collaboratorSocket, 'board:join', { boardId: board._id });

    const broadcast = new Promise((resolve) => {
      collaboratorSocket.once('card:created', resolve);
    });
    const activityBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('activity:created', resolve);
    });
    const ack = await emitWithAck(ownerSocket, 'card:create', {
      boardId: board._id,
      listId: list._id,
      title: 'Realtime card',
      position: 1000,
      tag: 'Feature',
      status: 'In Progress',
    });

    expect(ack.ok).toBe(true);
    expect(ack.data.card.title).toBe('Realtime card');
    expect(ack.data.card._id).toBeTruthy();

    const payload = await broadcast;
    const activityPayload = await activityBroadcast;
    expect(payload.boardId).toBe(board._id.toString());
    expect(payload.card._id.toString()).toBe(ack.data.card._id.toString());
    expect(activityPayload.activity.action).toBe('card.created');
    expect(ack.data.activity.action).toBe('card.created');
    await expect(Card.countDocuments({ board: board._id })).resolves.toBe(1);
    await expect(Activity.countDocuments({ board: board._id })).resolves.toBe(3);

    ownerSocket.disconnect();
    collaboratorSocket.disconnect();
    await server.close();
  });
});
