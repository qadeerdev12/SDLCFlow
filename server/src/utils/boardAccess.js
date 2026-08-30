// server/src/utils/boardAccess.js
import Board from '../models/Board.js';

// Returns the board if the user is a member, otherwise null.
// Centralizes the membership check so every list/card route reuses it.
export async function getBoardIfMember(boardId, userId) {
  const board = await Board.findById(boardId);
  if (!board) return null;

  const isMember = board.members.some(
    (m) => m.user.toString() === userId.toString()
  );

  return isMember ? board : null;
}

export function getMemberRole(board, userId) {
  const member = board.members.find(
    (m) => m.user.toString() === userId.toString()
  );

  return member?.role || null;
}

// Returns the board when the user has one of the allowed roles.
// Non-members still get null so controllers can return 404 and avoid leaking
// whether a private board exists.
export async function getBoardIfRole(boardId, userId, allowedRoles) {
  const board = await Board.findById(boardId);
  if (!board) return null;

  const role = getMemberRole(board, userId);
  if (!role) return null;

  if (!allowedRoles.includes(role)) {
    const err = new Error('You do not have permission to perform this action.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  return board;
}
