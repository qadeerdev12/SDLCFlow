// server/src/controllers/boardController.js
import Board from '../models/Board.js';

// POST /api/v1/boards  (protected)
// Creates a board; the creator automatically becomes the owner + first member.
export async function createBoard(req, res) {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Board name is required.' },
      });
    }

    // req.user was set by the `protect` middleware — that's who's creating this.
    const board = await Board.create({
      name,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'owner' }], // creator is the owner-member
    });

    return res.status(201).json({ data: { board } });
  } catch (err) {
    console.error('Create board error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}

// GET /api/v1/boards  (protected)
// Returns all boards where the current user is a member.
export async function getMyBoards(req, res) {
  try {
    // Query the embedded members array for this user's id — uses our index.
    const boards = await Board.find({ 'members.user': req.user._id }).sort({ updatedAt: -1 });
    return res.status(200).json({ data: { boards } });
  } catch (err) {
    console.error('Get boards error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}

// GET /api/v1/boards/:boardId  (protected)
export async function getBoard(req, res) {
  try {
    const board = await Board.findById(req.params.boardId);

    // Not found at all → 404.
    if (!board) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Board not found.' },
      });
    }

    // Authorization: is the requester a member of this board?
    // .some() returns true if ANY member's user id matches the requester.
    const isMember = board.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );

    // Not a member → 404 (NOT 403 — don't reveal the board exists).
    if (!isMember) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Board not found.' },
      });
    }

    return res.status(200).json({ data: { board } });
  } catch (err) {
    console.error('Get board error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}