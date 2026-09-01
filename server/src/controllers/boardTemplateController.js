import { getWorkflowTemplates } from './workflowTemplateController.js';

// GET /api/v1/board-templates (protected)
// Compatibility alias for the current client. The canonical route is now
// /api/v1/workflow-templates because templates seed workflows inside projects.
export async function getBoardTemplates(req, res) {
  return getWorkflowTemplates(req, res);
}
