import Message from '../models/Message.js';

function safeMessageBody(body) {
  const safeBody = typeof body === 'string' ? body.trim() : '';
  if (!safeBody) {
    const err = new Error('Message body is required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  return safeBody;
}

// Board chat intentionally uses its own service so REST and Socket.IO send
// messages through the same validation and persisted response shape.
export async function listBoardMessages(boardId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const messages = await Message.find({ board: boardId })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate('sender', 'name email');

  return messages.reverse();
}

export async function createBoardMessage({ boardId, senderId, body }) {
  const message = await Message.create({
    board: boardId,
    sender: senderId,
    body: safeMessageBody(body),
  });

  await message.populate('sender', 'name email');
  return message;
}
