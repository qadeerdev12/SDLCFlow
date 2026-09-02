import express from 'express';
import {
  getGitHubAccount,
  handleGitHubCallback,
  startGitHubOAuth,
} from '../controllers/githubIntegrationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/github/start', protect, startGitHubOAuth);
router.get('/github/account', protect, getGitHubAccount);
router.get('/github/callback', handleGitHubCallback);

export default router;
