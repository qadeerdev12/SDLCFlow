// server/src/controllers/boardController.js
import Board from '../models/Board.js';
import List from '../models/List.js';
import Card from '../models/Card.js';

// Keep in sync with the Board schema's color enum.
const BOARD_COLORS = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'];



// POST /api/v1/boards  (protected)
// Creates a board; the creator automatically becomes the owner + first member.
export async function createBoard(req, res) {
  try {
    const { name, emoji, color } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Board name is required.' },
      });
    }

    // Only accept a color from the known palette; otherwise fall back to the
    // schema default. This keeps a bad value from throwing a validation error.
    const safeColor = BOARD_COLORS.includes(color) ? color : undefined;
    const safeEmoji = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : undefined;

    // req.user was set by the `protect` middleware — that's who's creating this.
    const board = await Board.create({
      name,
      ...(safeEmoji && { emoji: safeEmoji }),
      ...(safeColor && { color: safeColor }),
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
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const isMember = board.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    // Fetch this board's lists and cards, ordered by position.
    const lists = await List.find({ board: board._id }).sort({ position: 1 });
    const cards = await Card.find({ board: board._id }).sort({ position: 1 });

    return res.status(200).json({ data: { board, lists, cards } });
  } catch (err) {
    console.error('Get board error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}