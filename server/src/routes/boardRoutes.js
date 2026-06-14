// server/src/routes/boardRoutes.js
import express from 'express';
import { createBoard, getMyBoards } from '../controllers/boardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Every board route requires login. Applying `protect` to all routes in this file:
router.use(protect);

router.post('/', createBoard);    // POST   /api/v1/boards
router.get('/', getMyBoards);     // GET    /api/v1/boards

export default router;