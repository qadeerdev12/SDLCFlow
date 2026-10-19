import express from 'express';
import {register, login, getMe, getProfile, updateProfile, updatePassword, deleteAccount} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { createAuthRateLimit } from '../middleware/authRateLimit.js';


export default function createAuthRoutes() {
  const router = express.Router();

  // Each app owns its counters. Limit before JSON parsing, database access, or bcrypt.
  router.post('/register', createAuthRateLimit('register'));
  router.post('/login', createAuthRateLimit('login'));
  router.use(express.json());

  router.post('/register', register);
  router.post('/login', login);
  router.get('/me', protect, getMe);
  router.get('/profile', protect, getProfile);
  router.patch('/profile', protect, updateProfile);
  router.patch('/password', protect, updatePassword);
  router.delete('/me', protect, deleteAccount);

  return router;
}
