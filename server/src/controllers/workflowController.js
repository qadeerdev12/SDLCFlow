import { getBoardIfMember, getBoardIfRole } from '../utils/boardAccess.js';
import { createWorkflow as createWorkflowMutation, listWorkflows } from '../services/workflowService.js';
import { recordActivity } from '../services/activityService.js';

function sendWorkflowError(res, err) {
  const status = err.statusCode || 500;
  const code = err.code || 'SERVER';
  const message = status === 500 ? 'Something went wrong.' : err.message;
  return res.status(status).json({ error: { code, message } });
}

// GET /api/v1/boards/:boardId/workflows
// Workflows are project areas inside a board, such as Sprint, Bug Triage,
// Release Plan, or any custom planning track.
export async function getWorkflows(req, res) {
  try {
    const board = await getBoardIfMember(req.params.boardId, req.user._id);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const workflows = await listWorkflows(board._id);
    return res.status(200).json({ data: { workflows } });
  } catch (err) {
    console.error('Get workflows error:', err.message);
    return sendWorkflowError(res, err);
  }
}

// POST /api/v1/boards/:boardId/workflows
// Only owners/admins can add top-level project structure. Members can still
// work inside the workflow once lists/cards are connected in later slices.
export async function createWorkflow(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const workflow = await createWorkflowMutation({
      boardId: board._id,
      name: req.body.name,
      position: req.body.position,
      templateKey: req.body.templateKey,
      icon: req.body.icon,
      color: req.body.color,
    });

    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'workflow.created',
      targetType: 'workflow',
      targetId: workflow._id,
      targetTitle: workflow.name,
    });

    return res.status(201).json({ data: { workflow, activity } });
  } catch (err) {
    console.error('Create workflow error:', err.message);
    return sendWorkflowError(res, err);
  }
}
