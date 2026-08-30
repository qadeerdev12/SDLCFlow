import { getBoardIfMember, getBoardIfRole } from '../utils/boardAccess.js';
import { createBoardMessage, listBoardMessages } from '../services/chatService.js';

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
