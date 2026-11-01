import express from 'express';
import { getBoardTemplates } from '../controllers/boardTemplateController.js';
import { protectVerified } from '../middleware/auth.js';

const router = express.Router();

router.use(protectVerified);

router.get('/', getBoardTemplates);

export default router;
