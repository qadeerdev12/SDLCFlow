import { listBoardTemplates } from '../data/boardTemplates.js';

// GET /api/v1/board-templates (protected)
// Returns starter board blueprints. Actual board creation from a template is
// handled separately so the catalog stays read-only and easy to cache later.
export async function getBoardTemplates(req, res) {
  return res.status(200).json({
    data: {
      templates: listBoardTemplates(),
    },
  });
}
