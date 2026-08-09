/**
 * Shared Express app factory for local `server.ts` and the Vercel `/api` function.
 *
 * Static / Vite middleware is attached only in `server.ts` so the serverless
 * entry stays API-only.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { api } from './routes/api';
import { logger } from './lib/logger';
import { store } from './lib/store';

export function createApp() {
  store.load();

  const app = express();

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Request logging. Bodies are never logged: they can carry credentials.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    const started = Date.now();
    res.on('finish', () => {
      logger.info('http', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    next();
  });

  app.use('/api', api);

  // JSON 404 for unmatched API routes so the SPA fallback cannot swallow them.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API endpoint.' });
  });

  // Central error handler — details are logged, never leaked to the client.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('http: unhandled error', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}
