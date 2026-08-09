/**
 * LURZ AI server entry point.
 *
 * Responsibilities are delegated to `server/lib` and `server/routes`; this file
 * only wires up the HTTP layer and serves the client.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/createApp';
import { logger } from './server/lib/logger';
import { resolveAppUrl } from './server/lib/appUrl';
import { warmProviderCaches } from './server/providers';

const app = createApp();
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
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
    logger.info(`LURZ AI server listening on ${resolveAppUrl()} (bound 0.0.0.0:${PORT})`);

    // Preload instrument lists in the background so the first search is fast.
    // Failures are logged per provider and never block startup.
    void warmProviderCaches();
  });
}

startServer().catch((err) => {
  logger.error('server: failed to start', err);
  process.exit(1);
});
