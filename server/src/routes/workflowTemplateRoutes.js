import express from 'express';
import { getWorkflowTemplates } from '../controllers/workflowTemplateController.js';
import { protectVerified } from '../middleware/auth.js';

const router = express.Router();

router.use(protectVerified);

router.get('/', getWorkflowTemplates);

export default router;
