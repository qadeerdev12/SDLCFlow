import Workflow from '../models/Workflow.js';
import List from '../models/List.js';
import Card from '../models/Card.js';

const WORKFLOW_COLORS = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'];
export const DEFAULT_WORKFLOW = {
  name: 'General',
  templateKey: 'default',
  icon: 'workflow',
  color: 'slate',
  position: 1000,
};

function makeValidationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION';
  return err;
}

function safeWorkflowName(name) {
  const safeName = typeof name === 'string' ? name.trim() : '';
  if (!safeName) throw makeValidationError('Workflow name is required.');
  return safeName;
}

function safeWorkflowColor(color) {
  if (color === undefined) return undefined;
  if (WORKFLOW_COLORS.includes(color)) return color;
  throw makeValidationError('Workflow color is invalid.');
}

export async function listWorkflows(boardId) {
  return Workflow.find({ board: boardId }).sort({ position: 1, createdAt: 1 });
}

export async function ensureDefaultWorkflow(boardId) {
  return Workflow.findOneAndUpdate(
    { board: boardId, templateKey: DEFAULT_WORKFLOW.templateKey },
    {
      $setOnInsert: {
        board: boardId,
        ...DEFAULT_WORKFLOW,
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    }
  );
}

export async function backfillBoardWorkItemsToDefaultWorkflow(boardId) {
  const workflow = await ensureDefaultWorkflow(boardId);

  // During the workflow migration, older lists/cards may not have a workflow
  // value at all. Mongo treats missing fields as null here, so this updates
  // both legacy shapes without touching already-scoped work.
  const [lists, cards] = await Promise.all([
    List.updateMany({ board: boardId, workflow: null }, { workflow: workflow._id }),
    Card.updateMany({ board: boardId, workflow: null }, { workflow: workflow._id }),
  ]);

  return {
    workflow,
    modified: {
      lists: lists.modifiedCount ?? 0,
      cards: cards.modifiedCount ?? 0,
    },
  };
}

export async function createWorkflow({ boardId, name, position, templateKey, icon, color }) {
  return Workflow.create({
    board: boardId,
    name: safeWorkflowName(name),
    position: position ?? 1000,
    ...(templateKey !== undefined && { templateKey: String(templateKey).trim() || 'custom' }),
    ...(icon !== undefined && { icon: String(icon).trim() || 'workflow' }),
    ...(color !== undefined && { color: safeWorkflowColor(color) }),
  });
}
