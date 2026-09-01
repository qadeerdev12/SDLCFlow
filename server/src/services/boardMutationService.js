import Card from '../models/Card.js';
import List from '../models/List.js';
import Board from '../models/Board.js';
import Workflow from '../models/Workflow.js';
import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import { ensureDefaultWorkflow } from './workflowService.js';

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

async function resolveWorkflowForBoard(boardId, workflowId) {
  if (!workflowId) return ensureDefaultWorkflow(boardId);

  if (!mongoose.Types.ObjectId.isValid(workflowId)) {
    const err = new Error('Workflow id is invalid.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const workflow = await Workflow.findOne({ _id: workflowId, board: boardId });
  if (!workflow) {
    const err = new Error('Workflow not found.');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  return workflow;
}

function safeEnumValue(value, allowed, fieldName) {
  if (value === undefined) return undefined;
  if (allowed.includes(value)) return value;

  const err = new Error(`${fieldName} is invalid.`);
  err.statusCode = 400;
  err.code = 'VALIDATION';
  throw err;
}

function safeDueDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('Due date is invalid.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  return date;
}

async function safeAssignee(boardId, userId) {
  if (userId === undefined) return undefined;
  if (userId === null || userId === '') return null;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const err = new Error('Assignee is invalid.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const board = await Board.findOne({ _id: boardId, 'members.user': userId }).select('_id');
  if (!board) {
    const err = new Error('Assignee must be a board member.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  return userId;
}

async function populateCardPeople(card) {
  return card.populate('assignee', 'name email');
}

export async function createList({ boardId, title, position, workflowId }) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle) {
    const err = new Error('List title is required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const workflow = await resolveWorkflowForBoard(boardId, workflowId);

  return List.create({
    board: boardId,
    workflow: workflow._id,
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
    { returnDocument: 'after', runValidators: true }
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
  // their comments so the database does not keep unreachable work items around.
  const cards = await Card.find({ board: boardId, list: list._id }).select('_id');
  await Comment.deleteMany({ board: boardId, card: { $in: cards.map((card) => card._id) } });
  await Card.deleteMany({ board: boardId, list: list._id });
  return true;
}

export async function createCard({ boardId, title, listId, position, tag, status, assignee, dueDate, workflowId }) {
  const safeTitle = typeof title === 'string' ? title.trim() : '';
  if (!safeTitle || !listId) {
    const err = new Error('Card title and listId are required.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const list = await assertListBelongsToBoard(boardId, listId);
  const workflow = workflowId
    ? await resolveWorkflowForBoard(boardId, workflowId)
    : list.workflow
      ? await resolveWorkflowForBoard(boardId, list.workflow)
      : await resolveWorkflowForBoard(boardId);

  if (list.workflow && list.workflow.toString() !== workflow._id.toString()) {
    const err = new Error('Card workflow must match the target list workflow.');
    err.statusCode = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const safeAssigneeId = await safeAssignee(boardId, assignee);
  const safeCardDueDate = safeDueDate(dueDate);

  const card = await Card.create({
    board: boardId,
    workflow: workflow._id,
    list: listId,
    title: safeTitle,
    ...(tag !== undefined && { tag: safeEnumValue(tag, CARD_TAGS, 'Card tag') }),
    ...(status !== undefined && { status: safeEnumValue(status, CARD_STATUSES, 'Card status') }),
    ...(safeAssigneeId !== undefined && { assignee: safeAssigneeId }),
    ...(safeCardDueDate !== undefined && { dueDate: safeCardDueDate }),
    position: position ?? 1000,
  });

  return populateCardPeople(card);
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
  if (updates.assignee !== undefined) safeUpdates.assignee = await safeAssignee(boardId, updates.assignee);
  if (updates.dueDate !== undefined) safeUpdates.dueDate = safeDueDate(updates.dueDate);
  if (updates.position !== undefined) safeUpdates.position = updates.position;
  if (updates.list !== undefined) {
    await assertListBelongsToBoard(boardId, updates.list);
    safeUpdates.list = updates.list;
  }

  const card = await Card.findOneAndUpdate(
    { _id: cardId, board: boardId },
    safeUpdates,
    { returnDocument: 'after', runValidators: true }
  ).populate('assignee', 'name email');

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

  await Comment.deleteMany({ board: boardId, card: card._id });
  return true;
}
