/**
 * Server-side transactional email via Resend.
 *
 * Auth emails (confirm signup, forgot password) are still sent by Supabase Auth.
 * Point Supabase Custom SMTP at Resend for those — see .env.example / README.
 * This module is for app-owned messages (e.g. welcome after sign-up).
 */

import { Resend } from 'resend';
import { logger } from './logger';
import { resolveAppUrl } from './appUrl';

const DEFAULT_FROM = 'LURZ AI <onboarding@resend.dev>';

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string };

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
}

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  userId?: string;
}): Promise<SendEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, skipped: true, error: 'RESEND_API_KEY is not configured.' };
  }

  const to = params.to.trim().toLowerCase();
  const name = params.name.trim() || 'Trader';
  const appUrl = resolveAppUrl();
  const idempotencyKey = `welcome-email/${params.userId || to}`;

  const { data, error } = await resend.emails.send(
    {
      from: fromAddress(),
      to: [to],
      subject: 'Welcome to LURZ AI',
      html: `
        <div style="font-family:Georgia,serif;line-height:1.5;color:#111;max-width:520px">
          <p style="font-size:20px;margin:0 0 12px">Welcome to LURZ AI, ${escapeHtml(name)}.</p>
          <p style="margin:0 0 16px">Your account is ready. Open the desk to review live markets and AI-scored setups.</p>
          <p style="margin:0 0 24px">
            <a href="${appUrl}/app" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none">
              Open LURZ AI
            </a>
          </p>
          <p style="margin:0;font-size:13px;color:#555">If you did not create this account, you can ignore this email.</p>
        </div>
      `.trim(),
      text: `Welcome to LURZ AI, ${name}.\n\nYour account is ready. Open the desk: ${appUrl}/app\n\nIf you did not create this account, you can ignore this email.`,
    },
    { idempotencyKey },
  );

  if (error) {
    logger.error('email: welcome send failed', { message: error.message, to });
    return { ok: false, skipped: false, error: error.message };
  }

  logger.info('email: welcome sent', { id: data?.id, to });
  return { ok: true, id: data?.id ?? '' };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
