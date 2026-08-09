/**
 * Vercel serverless entry — bundled to `api/index.cjs` at build time.
 *
 * Bundling avoids Node ESM resolution failures for extensionless relative
 * imports under `"type": "module"` on Vercel.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './createApp';

// Writable path for the JSON store on Vercel's read-only deployment FS.
if (process.env.VERCEL && !process.env.DATA_DIR) {
  process.env.DATA_DIR = '/tmp/lurz-data';
}

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
