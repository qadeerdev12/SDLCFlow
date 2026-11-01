import express from 'express';
import {
  disconnectGitHubAccount,
  getGitHubAccount,
  getGitHubDashboard,
  getGitHubRepositories,
  handleGitHubCallback,
  startGitHubOAuth,
} from '../controllers/githubIntegrationController.js';
import { protectVerified } from '../middleware/auth.js';

const router = express.Router();

router.get('/github/start', protectVerified, startGitHubOAuth);
router.get('/github/account', protectVerified, getGitHubAccount);
router.delete('/github/account', protectVerified, disconnectGitHubAccount);
router.get('/github/dashboard', protectVerified, getGitHubDashboard);
router.get('/github/repos', protectVerified, getGitHubRepositories);
router.get('/github/callback', handleGitHubCallback);

export default router;
