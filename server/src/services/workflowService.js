import Workflow from '../models/Workflow.js';

const WORKFLOW_COLORS = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'];

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
