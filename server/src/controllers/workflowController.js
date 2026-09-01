import { getBoardIfMember, getBoardIfRole } from '../utils/boardAccess.js';
import {
  createWorkflow as createWorkflowMutation,
  ensureDefaultWorkflow,
  listWorkflows,
} from '../services/workflowService.js';
import { resolveWorkflowTemplate, seedWorkflowFromTemplate } from '../services/workflowTemplateService.js';
import { recordActivity } from '../services/activityService.js';
import List from '../models/List.js';
import Card from '../models/Card.js';

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

    await ensureDefaultWorkflow(board._id);
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
  let workflow;
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const template = resolveWorkflowTemplate(req.body.workflowTemplateId || req.body.templateId);
    workflow = await createWorkflowMutation({
      boardId: board._id,
      name: req.body.name || template?.name,
      position: req.body.position,
      templateKey: req.body.templateKey || template?.id,
      icon: req.body.icon || template?.icon || template?.emoji,
      color: req.body.color || template?.color,
    });
    const seeded = await seedWorkflowFromTemplate(board._id, workflow._id, template);

    const activity = await recordActivity({
      io: req.app.get('io'),
      boardId: board._id,
      actorId: req.user._id,
      action: 'workflow.created',
      targetType: 'workflow',
      targetId: workflow._id,
      targetTitle: workflow.name,
    });

    return res.status(201).json({ data: { workflow, ...seeded, activity } });
  } catch (err) {
    if (workflow?._id) {
      await Promise.all([
        Card.deleteMany({ workflow: workflow._id }),
        List.deleteMany({ workflow: workflow._id }),
        workflow.deleteOne(),
      ]);
    }
    console.error('Create workflow error:', err.message);
    return sendWorkflowError(res, err);
  }
}
