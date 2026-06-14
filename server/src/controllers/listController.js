// server/src/controllers/listController.js
import List from '../models/List.js';
import { getBoardIfMember } from '../utils/boardAccess.js';

// POST /api/v1/boards/:boardId/lists
export async function createList(req, res) {
  try {
    const { title, position } = req.body;
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }
    if (!title) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'List title is required.' } });
    }

    const list = await List.create({
      board: board._id,
      title,
      position: position ?? 1000,   // default position if none given
    });
    return res.status(201).json({ data: { list } });
  } catch (err) {
    console.error('Create list error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}

// PATCH /api/v1/boards/:boardId/lists/:listId
export async function updateList(req, res) {
  try {
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const { title, position } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (position !== undefined) updates.position = position;

    // Find a list that matches BOTH its id AND this board (prevents cross-board edits).
    const list = await List.findOneAndUpdate(
      { _id: req.params.listId, board: board._id },
      updates,
      { new: true }   // return the updated doc, not the old one
    );
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found.' } });
    }
    return res.status(200).json({ data: { list } });
  } catch (err) {
    console.error('Update list error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}

// DELETE /api/v1/boards/:boardId/lists/:listId
export async function deleteList(req, res) {
  try {
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const list = await List.findOneAndDelete({ _id: req.params.listId, board: board._id });
    if (!list) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'List not found.' } });
    }
    // Note: cards in this list still exist — we'll handle cascade cleanup shortly.
    return res.status(200).json({ data: { deleted: true } });
  } catch (err) {
    console.error('Delete list error:', err.message);
    return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
  }
}