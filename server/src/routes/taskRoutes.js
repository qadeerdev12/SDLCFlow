import express from 'express';
import { protectVerified } from '../middleware/auth.js';
import { getMyTasks } from '../controllers/taskController.js';

const router = express.Router();
router.get('/mine', protectVerified, getMyTasks);
export default router;
