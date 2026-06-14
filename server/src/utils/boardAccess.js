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