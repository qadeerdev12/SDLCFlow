import express from 'express';
import { getBoardTemplates } from '../controllers/boardTemplateController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getBoardTemplates);

export default router;
