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
  const messages = await Message.find({ board: boardId, clearedAt: null })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate('sender', 'name email')
    .populate('deletedBy', 'name email');

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

function canDeleteMessage(message, actorId) {
  return message.sender.toString() === actorId.toString();
}

export async function deleteBoardMessage({ boardId, messageId, actorId }) {
  const message = await Message.findOne({ _id: messageId, board: boardId });
  if (!message) {
    const err = new Error('Message not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (!canDeleteMessage(message, actorId)) {
    const err = new Error('You do not have permission to delete this message.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (!message.deletedAt) {
    message.deletedAt = new Date();
    message.deletedBy = actorId;
    await message.save();
  }

  await message.populate('sender', 'name email');
  await message.populate('deletedBy', 'name email');
  return message;
}

export async function clearBoardMessages({ boardId, actorId }) {
  const now = new Date();
  const result = await Message.updateMany(
    { board: boardId, clearedAt: null },
    {
      $set: {
        deletedAt: now,
        deletedBy: actorId,
        clearedAt: now,
        clearedBy: actorId,
      },
    }
  );

  return result.modifiedCount || 0;
}
