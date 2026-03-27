import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { migrate } from './db/migrate';
import tasksRouter from './routes/tasks';
import { initWebSocket } from './websocket/index';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001');

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/tasks', tasksRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app);
  initWebSocket(server);

  return { app, server };
}

async function start() {
  try {
    // Run migrations
    await migrate();
    console.log('Database ready');

    const { server } = createApp();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only auto-start when this file is run directly
if (require.main === module) {
  start();
}
