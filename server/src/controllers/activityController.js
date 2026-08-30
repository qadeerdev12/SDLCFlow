import { getBoardIfRole } from '../utils/boardAccess.js';
import { listActivities } from '../services/activityService.js';

// GET /api/v1/boards/:boardId/activities
export async function getActivities(req, res) {
  try {
    const board = await getBoardIfRole(req.params.boardId, req.user._id, ['owner', 'admin', 'member']);
    if (!board) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Board not found.' } });
    }

    const activities = await listActivities(board._id);
    return res.status(200).json({ data: { activities } });
  } catch (err) {
    const status = err.statusCode || 500;
    const code = err.code || 'SERVER';
    const message = status === 500 ? 'Something went wrong.' : err.message;
    return res.status(status).json({ error: { code, message } });
  }
}
