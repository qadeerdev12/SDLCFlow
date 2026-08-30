// server/src/controllers/CardController.js
import Card from '../models/Card.js';
import { getBoardIfMember } from '../utils/boardAccess.js';

// POST /api/v1/boards/:boardId/cards
export async function createCard(req, res) {
    try {
        const { title, listId, position } = req.body;
        const board = await getBoardIfMember(req.params.boardId, req.user._id);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }
        if (!title || !listId) {
            return res.status(400).json({ error: { code: 'VALIDATION', message: 'Card title and listId are required.' } });
        }

        const card = await Card.create({
            board: board._id,
            list: listId,          // ← the card belongs to this list
            title,
            position: position ?? 1000,
        });
        return res.status(201).json({ data: { card } });
    } catch (err) {
        console.error('Create card error:', err.message);
        return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
    }
}

// PATCH /api/v1/boards/:boardId/cards/:cardId
export async function updateCard(req, res) {
    try {
        const board = await getBoardIfMember(req.params.boardId, req.user._id);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }

        const { title, description, position, list } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (position !== undefined) updates.position = position;
        if (list !== undefined) updates.list = list;

        // Find a card that matches BOTH its id AND this board (prevents cross-board edits).
        const card = await Card.findOneAndUpdate(
            { _id: req.params.cardId, board: board._id },
            updates,
            { new: true }   // return the updated doc, not the old one
        );
        if (!card) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found.' } });
        }
        return res.status(200).json({ data: { card } });
    } catch (err) {
        console.error('Update card error:', err.message);
        return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
    }
}

// DELETE /api/v1/boards/:boardId/cards/:cardId
export async function deleteCard(req, res) {
    try {
        const board = await getBoardIfMember(req.params.boardId, req.user._id);
        if (!board) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
        }

        const card = await Card.findOneAndDelete({ _id: req.params.cardId, board: board._id });
        if (!card) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card  not found.' } });
        }
        // Note: cards in this list still exist — we'll handle cascade cleanup shortly.
        return res.status(200).json({ data: { deleted: true } });
    } catch (err) {
        console.error('Delete card error:', err.message);
        return res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong.' } });
    }
}
