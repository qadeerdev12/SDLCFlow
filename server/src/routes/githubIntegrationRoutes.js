import express from 'express';
import {
  disconnectGitHubAccount,
  getGitHubAccount,
  getGitHubDashboard,
  getGitHubRepositories,
  handleGitHubCallback,
  startGitHubOAuth,
} from '../controllers/githubIntegrationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/github/start', protect, startGitHubOAuth);
router.get('/github/account', protect, getGitHubAccount);
router.delete('/github/account', protect, disconnectGitHubAccount);
router.get('/github/dashboard', protect, getGitHubDashboard);
router.get('/github/repos', protect, getGitHubRepositories);
router.get('/github/callback', handleGitHubCallback);

export default router;
