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