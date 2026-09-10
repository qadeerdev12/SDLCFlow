import { getBoardIfRole } from '../utils/boardAccess.js';
import { createDraftLimiter, draftError } from '../services/taskDraftService.js';
import { summarizeProject } from '../services/projectSummaryService.js';

const acquire = createDraftLimiter('summary');

export async function createProjectSummary(req, res) {
  res.set('Cache-Control', 'no-store');
  let release;
  try {
    const { boardId } = req.params;
    if (!/^[a-f\d]{24}$/i.test(boardId)) throw draftError('Invalid project id.', 400, 'VALIDATION');
    const canRead = () => getBoardIfRole(boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!await canRead()) throw draftError('Project not found.', 404, 'NOT_FOUND');
    release = acquire(req.user._id);
    const summary = await summarizeProject(boardId);
    // Generation can take seconds. Do not deliver private content after access
    // was revoked or the project was deleted during the provider request.
    if (!await canRead()) throw draftError('Project not found.', 404, 'NOT_FOUND');
    return res.json({ data: { summary } });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status === 429) res.set('Retry-After', '60');
    return res.status(status).json({ error: { code: err.code || 'SERVER', message: status === 500 ? 'Could not generate a project summary.' : err.message } });
  } finally {
    release?.();
  }
}
