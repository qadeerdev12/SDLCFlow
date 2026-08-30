import Board from '../models/Board.js';
import User from '../models/User.js';
import { getBoardIfRole, getMemberRole } from '../utils/boardAccess.js';
import { recordActivity } from '../services/activityService.js';

const MEMBER_ROLES = ['admin', 'member'];

function sendMemberError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

function makeError(message, statusCode = 400, code = 'VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

async function serializeBoardMembers(boardId) {
  const board = await Board.findById(boardId).populate('members.user', 'name email');
  return board.members.map((member) => ({
    user: {
      id: member.user._id.toString(),
      name: member.user.name,
      email: member.user.email,
    },
    role: member.role,
  }));
}

function emitMembersUpdated(req, boardId, members) {
  const io = req.app.get('io');
  if (!io) return;
  io.to(`board:${boardId}`).emit('members:updated', {
    boardId: boardId.toString(),
    members,
  });
}

// GET /api/v1/boards/:boardId/members
export async function getMembers(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const members = await serializeBoardMembers(board._id);
    return res.status(200).json({ data: { members } });
  } catch (err) {
    console.error('Get members error:', err.message);
    return sendMemberError(res, err);
  }
}

// POST /api/v1/boards/:boardId/members
export async function addMember(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const actorRole = getMemberRole(board, req.user._id);
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const requestedRole = req.body.role || 'member';

    if (!email) throw makeError('Email is required.');
    if (!MEMBER_ROLES.includes(requestedRole)) throw makeError('Role must be admin or member.');
    if (actorRole !== 'owner' && requestedRole !== 'member') {
      throw makeError('Only owners can add admins.', 403, 'FORBIDDEN');
    }

    const user = await User.findOne({ email });
    if (!user) throw makeError('No user found with that email.', 404, 'NOT_FOUND');

    const alreadyMember = board.members.some((member) => member.user.toString() === user._id.toString());
    if (alreadyMember) throw makeError('That user is already a board member.', 409, 'CONFLICT');

    board.members.push({ user: user._id, role: requestedRole });
    await board.save();

    const members = await serializeBoardMembers(board._id);
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'member.added',
      targetType: 'member',
      targetId: user._id,
      targetTitle: user.name || user.email,
      metadata: { role: requestedRole },
    });
    emitMembersUpdated(req, board._id, members);
    return res.status(201).json({ data: { members, activity } });
  } catch (err) {
    console.error('Add member error:', err.message);
    return sendMemberError(res, err);
  }
}

// PATCH /api/v1/boards/:boardId/members/:userId
export async function updateMemberRole(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const nextRole = req.body.role;
    if (!MEMBER_ROLES.includes(nextRole)) throw makeError('Role must be admin or member.');

    const member = board.members.find((m) => m.user.toString() === req.params.userId);
    if (!member) throw makeError('Member not found.', 404, 'NOT_FOUND');
    if (member.role === 'owner') throw makeError('Ownership transfer is not available yet.', 400, 'VALIDATION');

    member.role = nextRole;
    await board.save();

    const members = await serializeBoardMembers(board._id);
    const targetUser = await User.findById(req.params.userId);
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'member.role_updated',
      targetType: 'member',
      targetId: req.params.userId,
      targetTitle: targetUser?.name || targetUser?.email || '',
      metadata: { role: nextRole },
    });
    emitMembersUpdated(req, board._id, members);
    return res.status(200).json({ data: { members, activity } });
  } catch (err) {
    console.error('Update member role error:', err.message);
    return sendMemberError(res, err);
  }
}

// DELETE /api/v1/boards/:boardId/members/:userId
export async function removeMember(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const actorRole = getMemberRole(board, req.user._id);
    const member = board.members.find((m) => m.user.toString() === req.params.userId);
    if (!member) throw makeError('Member not found.', 404, 'NOT_FOUND');
    if (member.role === 'owner' && actorRole !== 'owner') {
      throw makeError('Only owners can remove owners.', 403, 'FORBIDDEN');
    }

    const ownerCount = board.members.filter((m) => m.role === 'owner').length;
    if (member.role === 'owner' && ownerCount <= 1) {
      throw makeError('A board must keep at least one owner.');
    }

    const targetUser = await User.findById(req.params.userId);
    board.members = board.members.filter((m) => m.user.toString() !== req.params.userId);
    await board.save();

    const members = await serializeBoardMembers(board._id);
    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'member.removed',
      targetType: 'member',
      targetId: req.params.userId,
      targetTitle: targetUser?.name || targetUser?.email || '',
    });
    emitMembersUpdated(req, board._id, members);
    return res.status(200).json({ data: { members, activity } });
  } catch (err) {
    console.error('Remove member error:', err.message);
    return sendMemberError(res, err);
  }
}
