import express from 'express';
import {register, login, getMe, getProfile, updateProfile, updatePassword, deleteAccount, logoutEverywhere} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { createAuthRateLimit } from '../middleware/authRateLimit.js';
import { createRefreshSecurity } from '../middleware/refreshSecurity.js';
import createRefreshRoutes from './refreshRoutes.js';
import { registrationMode } from '../config/registration.js';


// createApp supplies validated cookie options and its credentialed CORS origins.
export default function createAuthRoutes({ refresh } = {}) {
  const router = express.Router();
  const mode = registrationMode();
  const security = createRefreshSecurity(refresh);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.refreshSecurity = security;
    next();
  });
  // Mount before the general parser to preserve refresh's 1 KB limit and its
  // throttle-before-parse ordering. Resource routes remain bearer authenticated.
  router.use(createRefreshRoutes(refresh));
  router.get('/registration', (req, res) => res.json({ data: { mode } }));

  // Each app owns its counters. Limit before JSON parsing, database access, or bcrypt.
  router.post('/register', createAuthRateLimit('register'));
  router.post('/login', createAuthRateLimit('login'));
  router.post('/register', security.guard);
  // Preserve CSRF and throttling, but reject closed signup before parsing JSON,
  // querying users, hashing passwords, or creating any session cookies.
  router.post('/register', (req, res, next) => {
    if (mode === 'open') return next();
    return res.status(403).json({ error: {
      code: 'REGISTRATION_RESTRICTED',
      message: 'Public signup is currently closed. Existing members can still log in.',
    } });
  });
  router.post('/login', security.guard);
  router.patch('/password', security.guard);
  router.post('/logout-all', security.guard);
  router.delete('/me', security.guard);
  router.use(express.json());

  router.post('/register', register);
  router.post('/login', login);
  router.get('/me', protect, getMe);
  router.get('/profile', protect, getProfile);
  router.patch('/profile', protect, updateProfile);
  router.patch('/password', protect, updatePassword);
  router.post('/logout-all', protect, logoutEverywhere);
  router.delete('/me', protect, deleteAccount);

  router.use((error, req, res, next) => {
    if (!['entity.parse.failed', 'entity.too.large'].includes(error.type)) return next(error);
    return res.status(error.type === 'entity.too.large' ? 413 : 400)
      .json({ error: { code: 'VALIDATION', message: 'A valid JSON body is required.' } });
  });

  return router;
}
