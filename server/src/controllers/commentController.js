import Card from '../models/Card.js';
import Comment from '../models/Comment.js';
import { getBoardIfMember, getBoardIfRole } from '../utils/boardAccess.js';
import { recordActivity } from '../services/activityService.js';

function roomName(boardId) {
  return `board:${boardId}`;
}

function sendCommentError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

async function getCardForBoard(boardId, cardId) {
  const card = await Card.findOne({ _id: cardId, board: boardId }).select('_id title');
  if (!card) {
    const err = new Error('Card not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return card;
}

export async function getCardComments(req, res) {
  try {
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    await getCardForBoard(board._id, req.params.cardId);
    const comments = await Comment.find({ board: board._id, card: req.params.cardId })
      .sort({ createdAt: 1 })
      .populate('author', 'name email');

    return res.status(200).json({ data: { comments } });
  } catch (err) {
    console.error('Get comments error:', err.message);
    return sendCommentError(res, err);
  }
}

export async function createCardComment(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Comment body is required.' } });
    }

    const card = await getCardForBoard(board._id, req.params.cardId);
    const comment = await Comment.create({
      board: board._id,
      card: card._id,
      author: req.user._id,
      body,
    });
    await comment.populate('author', 'name email');

    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'comment.created',
      targetType: 'card',
      targetId: card._id,
      targetTitle: card.title,
    });

    req.app.get('io')?.to(roomName(board._id)).emit('comment:created', {
      boardId: board._id.toString(),
      cardId: card._id.toString(),
      comment,
    });

    return res.status(201).json({ data: { comment, activity } });
  } catch (err) {
    console.error('Create comment error:', err.message);
    return sendCommentError(res, err);
  }
}
