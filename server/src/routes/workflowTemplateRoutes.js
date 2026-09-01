import express from 'express';
import { getWorkflowTemplates } from '../controllers/workflowTemplateController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getWorkflowTemplates);

export default router;
