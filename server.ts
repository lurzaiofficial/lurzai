/**
 * TradePilot AI server entry point.
 *
 * Responsibilities are delegated to `server/lib` and `server/routes`; this file
 * only wires up the HTTP layer and serves the client.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import { api } from './server/routes/api';
import { logger } from './server/lib/logger';
import { store } from './server/lib/store';
import { warmProviderCaches } from './server/providers';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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

async function startServer() {
  store.load();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`TradePilot AI server listening on http://localhost:${PORT}`);

    // Preload instrument lists in the background so the first search is fast.
    // Failures are logged per provider and never block startup.
    void warmProviderCaches();
  });
}

startServer().catch((err) => {
  logger.error('server: failed to start', err);
  process.exit(1);
});
