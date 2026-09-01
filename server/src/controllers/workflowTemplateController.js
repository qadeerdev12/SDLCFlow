import { listWorkflowTemplates } from '../data/workflowTemplates.js';

// GET /api/v1/workflow-templates (protected)
// Workflow templates are reusable blueprints for areas inside a project board,
// such as sprints, release plans, or bug triage flows.
export async function getWorkflowTemplates(req, res) {
  return res.status(200).json({
    data: {
      templates: listWorkflowTemplates(),
    },
  });
}
