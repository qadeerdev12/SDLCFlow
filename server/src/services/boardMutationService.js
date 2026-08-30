import Card from '../models/Card.js';
import List from '../models/List.js';

const CARD_TAGS = ['Task', 'Feature', 'Bug', 'Design', 'Research', 'Docs', 'Chore'];
const CARD_STATUSES = ['Todo', 'In Progress', 'Review', 'Blocked', 'Done'];

// This service is the single write path for list/card mutations. REST
// controllers and Socket.IO handlers both call these functions so validation,
// cross-board checks, and persisted document shapes stay consistent.

// Cards may move between lists, but never across boards. Checking the target
// list here protects both REST PATCH calls and realtime card:move events.
async function assertListBelongsToBoard(boardId, listId) {
  const list = await List.findOne({ _id: listId, board: boardId });
  if (!list) {
    const err = new Error('List not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return list;
}

function safeEnumValue(value, allowed, fieldName) {
  if (value === undefined) return undefined;
  if (allowed.includes(value)) return value;

  const err = new Error(`${fieldName} is invalid.`);
  err.statusCode = 400;
  err.code = 'VALIDATION';
  throw err;
}

export async function createList({ boardId, title, position }) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle) {
    const err = new Error('List title is required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  return List.create({
    board: boardId,
    title: safeTitle,
    position: position ?? 1000,
  });
}

export async function updateList({ boardId, listId, updates }) {
  const safeUpdates = {};
  if (updates.title !== undefined) {
    const safeTitle = typeof updates.title === 'string' ? updates.title.trim() : '';
    if (!safeTitle) {
      const err = new Error('List title is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    safeUpdates.title = safeTitle;
  }
  if (updates.position !== undefined) safeUpdates.position = updates.position;

  const list = await List.findOneAndUpdate(
    { _id: listId, board: boardId },
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!list) {
    const err = new Error('List not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return list;
}

export async function deleteList({ boardId, listId }) {
  const list = await List.findOneAndDelete({ _id: listId, board: boardId });
  if (!list) {
    const err = new Error('List not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Lists own their visible cards in the UI. Deleting the list also removes
  // those cards so the database does not keep unreachable work items around.
  await Card.deleteMany({ board: boardId, list: list._id });
  return true;
}

export async function createCard({ boardId, title, listId, position, tag, status }) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle || !listId) {
    const err = new Error('Card title and listId are required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  await assertListBelongsToBoard(boardId, listId);

  return Card.create({
    board: boardId,
    list: listId,
    title: safeTitle,
    ...(tag !== undefined && { tag: safeEnumValue(tag, CARD_TAGS, 'Card tag') }),
    ...(status !== undefined && { status: safeEnumValue(status, CARD_STATUSES, 'Card status') }),
    position: position ?? 1000,
  });
}

export async function updateCard({ boardId, cardId, updates }) {
  const safeUpdates = {};
  if (updates.title !== undefined) {
    const safeTitle = typeof updates.title === 'string' ? updates.title.trim() : '';
    if (!safeTitle) {
      const err = new Error('Card title is required.');
      err.statusCode = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    safeUpdates.title = safeTitle;
  }
  if (updates.description !== undefined) safeUpdates.description = updates.description;
  if (updates.tag !== undefined) safeUpdates.tag = safeEnumValue(updates.tag, CARD_TAGS, 'Card tag');
  if (updates.status !== undefined) safeUpdates.status = safeEnumValue(updates.status, CARD_STATUSES, 'Card status');
  if (updates.position !== undefined) safeUpdates.position = updates.position;
  if (updates.list !== undefined) {
    await assertListBelongsToBoard(boardId, updates.list);
    safeUpdates.list = updates.list;
  }

  const card = await Card.findOneAndUpdate(
    { _id: cardId, board: boardId },
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!card) {
    const err = new Error('Card not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return card;
}

export async function deleteCard({ boardId, cardId }) {
  const card = await Card.findOneAndDelete({ _id: cardId, board: boardId });
  if (!card) {
    const err = new Error('Card not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return true;
}
