import express from 'express';
import cors from 'cors';
import createAuthRoutes from './routes/authRoutes.js';
import { trustedProxies } from './utils/trustedProxies.js';
import boardRoutes from './routes/boardRoutes.js';
import boardTemplateRoutes from './routes/boardTemplateRoutes.js';
import workflowTemplateRoutes from './routes/workflowTemplateRoutes.js';
import githubIntegrationRoutes from './routes/githubIntegrationRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import activityRoutes from './routes/activityRoutes.js';

export function allowedClientOrigins() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp({ io, refresh = null } = {}) {
  // Construction-only migration option, never selected from request data.
  // The live entry point stays legacy until the coordinated client cutover.
  if (refresh !== null && (typeof refresh !== 'object' || Array.isArray(refresh))) {
    throw new Error('Refresh configuration must be an explicit options object');
  }
  if (refresh && Object.hasOwn(refresh, 'origins')) {
    throw new Error('Configure refresh origins through CLIENT_ORIGIN, not a separate allowlist');
  }
  const app = express();
  app.set('trust proxy', trustedProxies());
  const clientOrigins = allowedClientOrigins();

  app.use(cors({
    origin: clientOrigins,
    credentials: true,
  }));

  if (io) app.set('io', io);

  // Cookie guards and credentialed CORS must agree on the exact origin set.
  app.use('/api/v1/auth', createAuthRoutes({
    refresh: refresh ? { ...refresh, origins: clientOrigins } : null,
  }));
  app.use(express.json());
  app.use('/api/v1/integrations', githubIntegrationRoutes);
  app.use('/api/v1/workflow-templates', workflowTemplateRoutes);
  app.use('/api/v1/board-templates', boardTemplateRoutes);
  app.use('/api/v1/boards', boardRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/activities', activityRoutes);

  app.get('/', (req, res) => {
    res.json({
      name: 'SDLCFlow API',
      status: 'ok',
      health: '/health',
      apiBase: '/api/v1',
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
