import express from 'express';
import { protectVerified } from '../middleware/auth.js';
import { getWorkspaceActivities } from '../controllers/activityController.js';

const router = express.Router();
router.get('/', protectVerified, getWorkspaceActivities);
export default router;
