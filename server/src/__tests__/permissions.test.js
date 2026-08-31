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
import Comment from '../models/Comment.js';
import Message from '../models/Message.js';

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
    Comment.deleteMany({}),
    Message.deleteMany({}),
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
  it('serves the board template catalog to authenticated users only', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');

    await request(app)
      .get('/api/v1/board-templates')
      .expect(401);

    const res = await request(app)
      .get('/api/v1/board-templates')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(res.body.data.templates.length).toBeGreaterThan(0);
    expect(res.body.data.templates[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      lists: expect.any(Array),
      cards: expect.any(Array),
    });
  });

  it('creates a board from a template with starter lists and cards', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');

    const res = await request(app)
      .post('/api/v1/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Sprint board', templateId: 'software-sprint' })
      .expect(201);

    expect(res.body.data.board).toMatchObject({
      name: 'Sprint board',
      emoji: 'code',
      color: 'indigo',
    });
    expect(res.body.data.lists.map((list) => list.title)).toEqual([
      'Backlog',
      'Ready',
      'In Progress',
      'Code Review',
      'QA',
      'Done',
    ]);
    expect(res.body.data.cards.map((card) => card.title)).toEqual([
      'Define sprint goal',
      'Review open bugs',
      'Prepare release checklist',
    ]);

    await expect(List.countDocuments({ board: res.body.data.board._id })).resolves.toBe(6);
    await expect(Card.countDocuments({ board: res.body.data.board._id })).resolves.toBe(3);
  });

  it('rejects unknown board templates without creating a board', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');

    await request(app)
      .post('/api/v1/boards')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Mystery board', templateId: 'unknown-template' })
      .expect(400);

    await expect(Board.countDocuments({ name: 'Mystery board' })).resolves.toBe(0);
  });

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

  it('only allows cards to be assigned to board members', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const teammate = await register(app, 'Teammate', 'teammate@example.com');
    const outsider = await register(app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    const list = await createListForBoard(app, owner.token, board._id);
    await addMember(app, owner.token, board._id, teammate.user.email, 'member');

    const assigned = await request(app)
      .post(`/api/v1/boards/${board._id}/cards`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        listId: list._id,
        title: 'Assigned task',
        position: 1000,
        assignee: teammate.user.id,
        dueDate: '2026-09-02',
      })
      .expect(201);

    expect(assigned.body.data.card.assignee._id).toBe(teammate.user.id);
    expect(assigned.body.data.card.dueDate).toBeTruthy();

    await request(app)
      .post(`/api/v1/boards/${board._id}/cards`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        listId: list._id,
        title: 'Wrong assignee',
        position: 2000,
        assignee: outsider.user.id,
      })
      .expect(400);

    await request(app)
      .patch(`/api/v1/boards/${board._id}/cards/${assigned.body.data.card._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee: outsider.user.id })
      .expect(400);

    await request(app)
      .patch(`/api/v1/boards/${board._id}/cards/${assigned.body.data.card._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ assignee: null, dueDate: null })
      .expect(200);

    await expect(Card.countDocuments({ board: board._id })).resolves.toBe(1);
  });

  it('keeps card comments board-scoped and records comment activity', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const member = await register(app, 'Member', 'member@example.com');
    const outsider = await register(app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    const list = await createListForBoard(app, owner.token, board._id);
    await addMember(app, owner.token, board._id, member.user.email, 'member');
    const card = await request(app)
      .post(`/api/v1/boards/${board._id}/cards`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ listId: list._id, title: 'Comment target', position: 1000 })
      .expect(201);

    await request(app)
      .get(`/api/v1/boards/${board._id}/cards/${card.body.data.card._id}/comments`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/boards/${board._id}/cards/${card.body.data.card._id}/comments`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ body: 'No access' })
      .expect(404);

    const created = await request(app)
      .post(`/api/v1/boards/${board._id}/cards/${card.body.data.card._id}/comments`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: 'I will take this one.' })
      .expect(201);

    expect(created.body.data.comment.body).toBe('I will take this one.');
    expect(created.body.data.comment.author._id).toBe(member.user.id);
    expect(created.body.data.activity.action).toBe('comment.created');
    await expect(Comment.countDocuments({ board: board._id })).resolves.toBe(1);
  });

  it('keeps board chat private to members and persists messages', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const member = await register(app, 'Member', 'member@example.com');
    const outsider = await register(app, 'Outsider', 'outsider@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    await addMember(app, owner.token, board._id, member.user.email, 'member');

    await request(app)
      .get(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(404);

    await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ body: 'No access' })
      .expect(404);

    await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: '' })
      .expect(400);

    const created = await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: 'Can someone review the API task?' })
      .expect(201);

    expect(created.body.data.message.body).toBe('Can someone review the API task?');
    expect(created.body.data.message.sender._id).toBe(member.user.id);

    const messages = await request(app)
      .get(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(messages.body.data.messages).toHaveLength(1);
    expect(messages.body.data.messages[0].body).toBe('Can someone review the API task?');
    await expect(Message.countDocuments({ board: board._id })).resolves.toBe(1);
  });

  it('enforces board chat moderation permissions', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const admin = await register(app, 'Admin', 'admin@example.com');
    const member = await register(app, 'Member', 'member@example.com');
    const board = await createBoardWithOwner(app, owner.token);
    await addMember(app, owner.token, board._id, admin.user.email, 'admin');
    await addMember(app, owner.token, board._id, member.user.email, 'member');

    const ownerMessage = await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'Owner decision.' })
      .expect(201);
    const memberMessage = await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: 'Member update.' })
      .expect(201);

    await request(app)
      .delete(`/api/v1/boards/${board._id}/messages/${ownerMessage.body.data.message._id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);

    await request(app)
      .delete(`/api/v1/boards/${board._id}/messages/${ownerMessage.body.data.message._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(403);

    await request(app)
      .delete(`/api/v1/boards/${board._id}/messages/${memberMessage.body.data.message._id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);

    const memberDeleted = await request(app)
      .delete(`/api/v1/boards/${board._id}/messages/${memberMessage.body.data.message._id}`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200);
    expect(memberDeleted.body.data.message.deletedAt).toBeTruthy();
    expect(memberDeleted.body.data.activity.action).toBe('message.deleted');

    await request(app)
      .delete(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(403);

    await request(app)
      .post(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ body: 'Clear this one.' })
      .expect(201);

    const cleared = await request(app)
      .delete(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(cleared.body.data.deletedCount).toBe(3);
    expect(cleared.body.data.activity.action).toBe('chat.cleared');

    const messages = await request(app)
      .get(`/api/v1/boards/${board._id}/messages`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(messages.body.data.messages).toHaveLength(0);
    await expect(Activity.countDocuments({ board: board._id, action: 'message.deleted' })).resolves.toBe(1);
    await expect(Activity.countDocuments({ board: board._id, action: 'chat.cleared' })).resolves.toBe(1);
  });

  it('loads profile stats and deletes an account with related personal data', async () => {
    const app = createApp();
    const owner = await register(app, 'Owner', 'owner@example.com');
    const user = await register(app, 'User', 'user@example.com');
    const ownedBoard = await createBoardWithOwner(app, user.token, 'Personal project');
    const sharedBoard = await createBoardWithOwner(app, owner.token, 'Shared project');
    await addMember(app, owner.token, sharedBoard._id, user.user.email, 'member');

    const ownedList = await createListForBoard(app, user.token, ownedBoard._id);
    await request(app)
      .post(`/api/v1/boards/${ownedBoard._id}/cards`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ listId: ownedList._id, title: 'Owned card', position: 1000 })
      .expect(201);

    const sharedList = await createListForBoard(app, owner.token, sharedBoard._id);
    const sharedCard = await request(app)
      .post(`/api/v1/boards/${sharedBoard._id}/cards`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ listId: sharedList._id, title: 'Shared card', position: 1000, assignee: user.user.id })
      .expect(201);
    await request(app)
      .post(`/api/v1/boards/${sharedBoard._id}/cards/${sharedCard.body.data.card._id}/comments`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Leaving a note before account deletion.' })
      .expect(201);
    await request(app)
      .post(`/api/v1/boards/${sharedBoard._id}/messages`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ body: 'Shared board chat before account deletion.' })
      .expect(201);

    const profile = await request(app)
      .get('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    expect(profile.body.data.user.email).toBe(user.user.email);
    expect(profile.body.data.stats.boards).toBe(2);
    expect(profile.body.data.stats.ownedBoards).toBe(1);
    expect(profile.body.data.stats.assignedCards).toBe(1);
    expect(profile.body.data.stats.comments).toBe(1);
    await expect(Message.countDocuments({ sender: user.user.id })).resolves.toBe(1);

    await request(app)
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'wrong-password' })
      .expect(401);

    await request(app)
      .delete('/api/v1/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'password123' })
      .expect(200);

    await expect(User.exists({ _id: user.user.id })).resolves.toBeNull();
    await expect(Board.exists({ _id: ownedBoard._id })).resolves.toBeNull();
    await expect(List.countDocuments({ board: ownedBoard._id })).resolves.toBe(0);
    await expect(Card.countDocuments({ board: ownedBoard._id })).resolves.toBe(0);
    await expect(Comment.countDocuments({ author: user.user.id })).resolves.toBe(0);
    await expect(Message.countDocuments({ sender: user.user.id })).resolves.toBe(0);
    await expect(Activity.countDocuments({ actor: user.user.id })).resolves.toBe(0);

    const remainingBoard = await Board.findById(sharedBoard._id);
    expect(remainingBoard.members.some((member) => member.user.toString() === user.user.id)).toBe(false);
    const remainingCard = await Card.findById(sharedCard.body.data.card._id);
    expect(remainingCard.assignee).toBeNull();
  });

  it('updates profile details and password with credential checks', async () => {
    const app = createApp();
    const user = await register(app, 'Old Name', 'old@example.com');
    await register(app, 'Taken Email', 'taken@example.com');

    await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Duplicate', email: 'taken@example.com' })
      .expect(409);

    const profile = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'New Name', email: 'new@example.com' })
      .expect(200);

    expect(profile.body.data.user.name).toBe('New Name');
    expect(profile.body.data.user.email).toBe('new@example.com');

    await request(app)
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' })
      .expect(401);

    await request(app)
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currentPassword: 'password123', newPassword: 'new-password-123' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'new@example.com', password: 'password123' })
      .expect(401);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'new@example.com', password: 'new-password-123' })
      .expect(200);
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

    const commentBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('comment:created', resolve);
    });
    const commentActivityBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('activity:created', resolve);
    });
    const commentAck = await emitWithAck(ownerSocket, 'comment:create', {
      boardId: board._id,
      cardId: ack.data.card._id,
      body: 'This is ready for review.',
    });

    expect(commentAck.ok).toBe(true);
    expect(commentAck.data.comment.body).toBe('This is ready for review.');
    const commentPayload = await commentBroadcast;
    const commentActivityPayload = await commentActivityBroadcast;
    expect(commentPayload.cardId).toBe(ack.data.card._id.toString());
    expect(commentPayload.comment._id.toString()).toBe(commentAck.data.comment._id.toString());
    expect(commentActivityPayload.activity.action).toBe('comment.created');
    await expect(Comment.countDocuments({ board: board._id })).resolves.toBe(1);

    const messageBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('message:created', resolve);
    });
    const messageAck = await emitWithAck(ownerSocket, 'message:create', {
      boardId: board._id,
      body: 'Realtime chat is working.',
    });

    expect(messageAck.ok).toBe(true);
    expect(messageAck.data.message.body).toBe('Realtime chat is working.');
    const messagePayload = await messageBroadcast;
    expect(messagePayload.boardId).toBe(board._id.toString());
    expect(messagePayload.message._id.toString()).toBe(messageAck.data.message._id.toString());
    await expect(Message.countDocuments({ board: board._id })).resolves.toBe(1);

    const typingBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('chat:typing', resolve);
    });
    const typingAck = await emitWithAck(ownerSocket, 'chat:typing', {
      boardId: board._id,
      typing: true,
    });
    expect(typingAck.ok).toBe(true);
    expect(typingAck.data.typing).toBe(true);
    const typingPayload = await typingBroadcast;
    expect(typingPayload.boardId).toBe(board._id.toString());
    expect(typingPayload.user.email).toBe(owner.user.email);
    expect(typingPayload.typing).toBe(true);

    const deniedDelete = await emitWithAck(collaboratorSocket, 'message:delete', {
      boardId: board._id,
      messageId: messageAck.data.message._id,
    });
    expect(deniedDelete.ok).toBe(false);
    expect(deniedDelete.error.code).toBe('FORBIDDEN');

    const deleteBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('message:deleted', resolve);
    });
    const deleteActivityBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('activity:created', resolve);
    });
    const deleteAck = await emitWithAck(ownerSocket, 'message:delete', {
      boardId: board._id,
      messageId: messageAck.data.message._id,
    });
    expect(deleteAck.ok).toBe(true);
    expect(deleteAck.data.message.deletedAt).toBeTruthy();
    expect(deleteAck.data.activity.action).toBe('message.deleted');
    const deletePayload = await deleteBroadcast;
    const deleteActivityPayload = await deleteActivityBroadcast;
    expect(deletePayload.message._id.toString()).toBe(messageAck.data.message._id.toString());
    expect(deleteActivityPayload.activity.action).toBe('message.deleted');

    const collaboratorMessageAck = await emitWithAck(collaboratorSocket, 'message:create', {
      boardId: board._id,
      body: 'Collaborator message stays personal.',
    });
    expect(collaboratorMessageAck.ok).toBe(true);

    const ownerDeniedDelete = await emitWithAck(ownerSocket, 'message:delete', {
      boardId: board._id,
      messageId: collaboratorMessageAck.data.message._id,
    });
    expect(ownerDeniedDelete.ok).toBe(false);
    expect(ownerDeniedDelete.error.code).toBe('FORBIDDEN');

    await emitWithAck(ownerSocket, 'message:create', {
      boardId: board._id,
      body: 'First clear target.',
    });
    await emitWithAck(ownerSocket, 'message:create', {
      boardId: board._id,
      body: 'Second clear target.',
    });

    const clearBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('chat:cleared', resolve);
    });
    const clearActivityBroadcast = new Promise((resolve) => {
      collaboratorSocket.once('activity:created', resolve);
    });
    const clearAck = await emitWithAck(ownerSocket, 'chat:clear', { boardId: board._id });
    expect(clearAck.ok).toBe(true);
    expect(clearAck.data.deletedCount).toBe(4);
    expect(clearAck.data.activity.action).toBe('chat.cleared');
    const clearPayload = await clearBroadcast;
    const clearActivityPayload = await clearActivityBroadcast;
    expect(clearPayload.deletedCount).toBe(4);
    expect(clearActivityPayload.activity.action).toBe('chat.cleared');

    ownerSocket.disconnect();
    collaboratorSocket.disconnect();
    await server.close();
  });
});
