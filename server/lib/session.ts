/**
 * Session identity.
 *
 * This application holds no exchange credentials, so there is no secret vault.
 * A session id exists only to keep one user's signal history and settings
 * separate from another's. It is opaque, random, and carries no personal data.
 */

import crypto from 'node:crypto';
import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'tp_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Reads the session cookie, issuing one if absent. */
export function ensureSession(req: Request, res: Response): string {
  const existing = readCookie(req, SESSION_COOKIE);
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;

  const sid = crypto.randomBytes(16).toString('hex');
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,   // unreadable from JavaScript
    sameSite: 'lax',  // blocks cross-site submission
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return sid;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
