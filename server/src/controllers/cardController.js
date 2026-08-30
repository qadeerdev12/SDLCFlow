import { getBoardIfRole } from '../utils/boardAccess.js';
import {
    createCard as createCardMutation,
    updateCard as updateCardMutation,
    deleteCard as deleteCardMutation,
} from '../services/boardMutationService.js';

function sendMutationError(res, err) {
    const status = err.statusCode || 500;
    const code = err.code || 'SERVER';
    const message = status === 500 ? 'Something went wrong.' : err.message;
    return res.status(status).json({ error: { code, message } });
}

// POST /api/v1/boards/:boardId/cards
export async function createCard(req, res) {
    try {
        const { title, listId, position, tag, status } = req.body;
        const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }
        const card = await createCardMutation({ boardId: board._id, title, listId, position, tag, status });
        return res.status(201).json({ data: { card } });
    } catch (err) {
        console.error('Create card error:', err.message);
        return sendMutationError(res, err);
    }
}

// PATCH /api/v1/boards/:boardId/cards/:cardId
export async function updateCard(req, res) {
    try {
        const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }

        const card = await updateCardMutation({
            boardId: board._id,
            cardId: req.params.cardId,
            updates: req.body,
        });
        return res.status(200).json({ data: { card } });
    } catch (err) {
        console.error('Update card error:', err.message);
        return sendMutationError(res, err);
    }
}

// DELETE /api/v1/boards/:boardId/cards/:cardId
export async function deleteCard(req, res) {
    try {
        const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }

        await deleteCardMutation({ boardId: board._id, cardId: req.params.cardId });
        return res.status(200).json({ data: { deleted: true } });
    } catch (err) {
        console.error('Delete card error:', err.message);
        return sendMutationError(res, err);
    }
}
