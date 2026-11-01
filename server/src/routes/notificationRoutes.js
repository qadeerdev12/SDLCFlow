import express from 'express';
import { protectVerified } from '../middleware/auth.js';
import { getNotifications, readNotification, readAllNotifications } from '../controllers/notificationController.js';

const router = express.Router();
router.get('/', protectVerified, getNotifications);
router.patch('/read-all', protectVerified, readAllNotifications);
router.patch('/:notificationId/read', protectVerified, readNotification);
export default router;
