import { getBoardIfRole } from '../utils/boardAccess.js';
import {
  createList as createListMutation,
  updateList as updateListMutation,
  deleteList as deleteListMutation,
} from '../services/boardMutationService.js';

function sendMutationError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

// POST /api/v1/boards/:boardId/lists
export async function createList(req, res) {
  try {
    const { title, position } = req.body;
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }
    const list = await createListMutation({ boardId: board._id, title, position });
    return res.status(201).json({ data: { list } });
  } catch (err) {
    console.error('Create list error:', err.message);
    return sendMutationError(res, err);
  }
}

// PATCH /api/v1/boards/:boardId/lists/:listId
export async function updateList(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const list = await updateListMutation({
      boardId: board._id,
      listId: req.params.listId,
      updates: req.body,
    });
    return res.status(200).json({ data: { list } });
  } catch (err) {
    console.error('Update list error:', err.message);
    return sendMutationError(res, err);
  }
}

// DELETE /api/v1/boards/:boardId/lists/:listId
export async function deleteList(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    await deleteListMutation({ boardId: board._id, listId: req.params.listId });
    return res.status(200).json({ data: { deleted: true } });
  } catch (err) {
    console.error('Delete list error:', err.message);
    return sendMutationError(res, err);
  }
}
