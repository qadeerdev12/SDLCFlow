import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import boardRoutes from './routes/boardRoutes.js';

export function allowedClientOrigins() {
  return (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp({ io } = {}) {
  const app = express();
  const clientOrigins = allowedClientOrigins();

  app.use(cors({
    origin: clientOrigins,
    credentials: true,
  }));

  if (io) app.set('io', io);

  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/boards', boardRoutes);

  app.get('/', (req, res) => {
    res.json({
      name: 'CollabBoard API',
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
