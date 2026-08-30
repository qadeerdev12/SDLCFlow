import jwt from 'jsonwebtoken';
import User from './models/User.js';
import { getBoardIfMember } from './utils/boardAccess.js';
import {
  createCard,
  updateCard,
  deleteCard,
  createList,
  updateList,
  deleteList,
} from './services/boardMutationService.js';

const presenceByBoard = new Map();
const presenceTimers = new Map();

function roomName(boardId) {
  return `board:${boardId}`;
}

function socketError(err) {
  return {
    ok: false,
    error: {
      code: err.code || 'SERVER',
      message: err.statusCode === 500 ? 'Something went wrong.' : err.message,
    },
  };
}

function ackSuccess(data = {}) {
  return { ok: true, data };
}

function normalizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

function getPresenceList(boardId) {
  const boardPresence = presenceByBoard.get(boardId);
  if (!boardPresence) return [];

  return [...boardPresence.values()].map((entry) => ({
    user: entry.user,
    socketCount: entry.sockets.size,
    lastSeen: entry.lastSeen,
  }));
}

function schedulePresence(io, boardId) {
  if (presenceTimers.has(boardId)) return;

  const timer = setTimeout(() => {
    presenceTimers.delete(boardId);
    io.to(roomName(boardId)).emit('presence:update', {
      boardId,
      users: getPresenceList(boardId),
    });
  }, 500);

  presenceTimers.set(boardId, timer);
}

function addPresence(io, socket, boardId) {
  const normalizedBoardId = boardId.toString();
  const userId = socket.data.user._id.toString();
  const user = normalizeUser(socket.data.user);
  const boardPresence = presenceByBoard.get(normalizedBoardId) || new Map();
  const existing = boardPresence.get(userId) || {
    user,
    sockets: new Set(),
    lastSeen: new Date().toISOString(),
  };

  existing.sockets.add(socket.id);
  existing.lastSeen = new Date().toISOString();
  boardPresence.set(userId, existing);
  presenceByBoard.set(normalizedBoardId, boardPresence);
  schedulePresence(io, normalizedBoardId);
}

function removePresence(io, socket) {
  const boardIds = socket.data.boardIds || new Set();
  const userId = socket.data.user?._id?.toString();
  if (!userId) return;

  for (const boardId of boardIds) {
    const boardPresence = presenceByBoard.get(boardId);
    if (!boardPresence) continue;

    const entry = boardPresence.get(userId);
    if (!entry) continue;

    entry.sockets.delete(socket.id);
    entry.lastSeen = new Date().toISOString();

    if (entry.sockets.size === 0) boardPresence.delete(userId);
    if (boardPresence.size === 0) presenceByBoard.delete(boardId);
    schedulePresence(io, boardId);
  }
}

async function requireBoardMember(socket, boardId) {
  if (!boardId) {
    const err = new Error('Board id is required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const board = await getBoardIfMember(boardId, socket.data.user._id);
  if (!board) {
    const err = new Error('Board not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return board;
}

function registerMutation(socket, eventName, handler) {
  socket.on(eventName, async (payload = {}, callback) => {
    try {
      const result = await handler(payload);
      if (typeof callback === 'function') callback(ackSuccess(result));
    } catch (err) {
      console.error(`${eventName} socket error:`, err.message);
      if (typeof callback === 'function') callback(socketError(err));
      else socket.emit('board:error', socketError(err).error);
    }
  });
}

export function configureSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        const err = new Error('Authentication token is required.');
        err.data = { code: 'NO_TOKEN_PROVIDED' };
        return next(err);
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        const err = new Error('User not found.');
        err.data = { code: 'USER_NOT_FOUND' };
        return next(err);
      }

      socket.data.user = user;
      socket.data.boardIds = new Set();
      return next();
    } catch {
      const err = new Error('Invalid authentication token.');
      err.data = { code: 'INVALID_TOKEN' };
      return next(err);
    }
  });

  io.on('connection', (socket) => {
    socket.on('board:join', async ({ boardId } = {}, callback) => {
      try {
        const board = await requireBoardMember(socket, boardId);
        const normalizedBoardId = board._id.toString();
        socket.join(roomName(normalizedBoardId));
        socket.data.boardIds.add(normalizedBoardId);
        addPresence(io, socket, normalizedBoardId);

        if (typeof callback === 'function') {
          callback(ackSuccess({
            boardId: normalizedBoardId,
            presence: getPresenceList(normalizedBoardId),
          }));
        }
      } catch (err) {
        console.error('board:join socket error:', err.message);
        if (typeof callback === 'function') callback(socketError(err));
      }
    });

    registerMutation(socket, 'card:create', async ({ boardId, title, listId, position }) => {
      const board = await requireBoardMember(socket, boardId);
      const card = await createCard({ boardId: board._id, title, listId, position });
      socket.to(roomName(board._id)).emit('card:created', { boardId: board._id.toString(), card });
      return { card };
    });

    registerMutation(socket, 'card:update', async ({ boardId, cardId, updates }) => {
      const board = await requireBoardMember(socket, boardId);
      const card = await updateCard({ boardId: board._id, cardId, updates: updates || {} });
      socket.to(roomName(board._id)).emit('card:updated', { boardId: board._id.toString(), card });
      return { card };
    });

    registerMutation(socket, 'card:move', async ({ boardId, cardId, position, list }) => {
      const board = await requireBoardMember(socket, boardId);
      const card = await updateCard({ boardId: board._id, cardId, updates: { position, list } });
      socket.to(roomName(board._id)).emit('card:moved', { boardId: board._id.toString(), card });
      return { card };
    });

    registerMutation(socket, 'card:delete', async ({ boardId, cardId }) => {
      const board = await requireBoardMember(socket, boardId);
      await deleteCard({ boardId: board._id, cardId });
      socket.to(roomName(board._id)).emit('card:deleted', { boardId: board._id.toString(), cardId });
      return { deleted: true };
    });

    registerMutation(socket, 'list:create', async ({ boardId, title, position }) => {
      const board = await requireBoardMember(socket, boardId);
      const list = await createList({ boardId: board._id, title, position });
      socket.to(roomName(board._id)).emit('list:created', { boardId: board._id.toString(), list });
      return { list };
    });

    registerMutation(socket, 'list:update', async ({ boardId, listId, updates }) => {
      const board = await requireBoardMember(socket, boardId);
      const list = await updateList({ boardId: board._id, listId, updates: updates || {} });
      socket.to(roomName(board._id)).emit('list:updated', { boardId: board._id.toString(), list });
      return { list };
    });

    registerMutation(socket, 'list:move', async ({ boardId, listId, position }) => {
      const board = await requireBoardMember(socket, boardId);
      const list = await updateList({ boardId: board._id, listId, updates: { position } });
      socket.to(roomName(board._id)).emit('list:moved', { boardId: board._id.toString(), list });
      return { list };
    });

    registerMutation(socket, 'list:delete', async ({ boardId, listId }) => {
      const board = await requireBoardMember(socket, boardId);
      await deleteList({ boardId: board._id, listId });
      socket.to(roomName(board._id)).emit('list:deleted', { boardId: board._id.toString(), listId });
      return { deleted: true };
    });

    socket.on('disconnect', () => {
      removePresence(io, socket);
    });
  });
}
