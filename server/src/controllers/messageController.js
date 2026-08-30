import { getBoardIfMember, getBoardIfRole, getMemberRole } from '../utils/boardAccess.js';
import { recordActivity } from '../services/activityService.js';
import {
  clearBoardMessages,
  createBoardMessage,
  deleteBoardMessage,
  listBoardMessages,
} from '../services/chatService.js';

function roomName(boardId) {
  return `board:${boardId}`;
}

function sendMessageError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

// GET /api/v1/boards/:boardId/messages
export async function getBoardMessages(req, res) {
  try {
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const messages = await listBoardMessages(board._id, req.query.limit);
    return res.status(200).json({ data: { messages } });
  } catch (err) {
    console.error('Get board messages error:', err.message);
    return sendMessageError(res, err);
  }
}

// POST /api/v1/boards/:boardId/messages
export async function createBoardChatMessage(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const message = await createBoardMessage({
      boardId: board._id,
      senderId: req.user._id,
      body: req.body.body,
    });

    req.app.get('io')?.to(roomName(board._id)).emit('message:created', {
      boardId: board._id.toString(),
      message,
    });

    return res.status(201).json({ data: { message } });
  } catch (err) {
    console.error('Create board message error:', err.message);
    return sendMessageError(res, err);
  }
}

// DELETE /api/v1/boards/:boardId/messages/:messageId
export async function deleteBoardChatMessage(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const message = await deleteBoardMessage({
      boardId: board._id,
      messageId: req.params.messageId,
      actorId: req.user._id,
      actorRole: getMemberRole(board, req.user._id),
    });
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'message.deleted',
      targetType: 'message',
      targetId: message._id,
      targetTitle: 'Chat message',
    });

    req.app.get('io')?.to(roomName(board._id)).emit('message:deleted', {
      boardId: board._id.toString(),
      message,
    });

    return res.status(200).json({ data: { message, activity } });
  } catch (err) {
    console.error('Delete board message error:', err.message);
    return sendMessageError(res, err);
  }
}

// DELETE /api/v1/boards/:boardId/messages
export async function clearBoardChat(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const deletedCount = await clearBoardMessages({ boardId: board._id, actorId: req.user._id });
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'chat.cleared',
      targetType: 'board',
      targetId: board._id,
      targetTitle: board.name,
      metadata: { deletedCount },
    });

    req.app.get('io')?.to(roomName(board._id)).emit('chat:cleared', {
      boardId: board._id.toString(),
      deletedCount,
    });

    return res.status(200).json({ data: { deletedCount, activity } });
  } catch (err) {
    console.error('Clear board chat error:', err.message);
    return sendMessageError(res, err);
  }
}
