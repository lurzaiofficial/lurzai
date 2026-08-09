/**
 * Vercel serverless entry for Express `/api/*` routes.
 *
 * Frontend assets are served by Vercel's Vite static output; this function only
 * handles JSON/SSE API traffic.
 */

import { createApp } from '../server/createApp';

const app = createApp();

export default app;
