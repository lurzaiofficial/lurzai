/**
 * Public site origin for OpenRouter attribution and similar server-side headers.
 *
 * Prefer an explicit APP_URL. On Vercel, fall back to the deployment host so
 * production does not advertise localhost.
 */
export function resolveAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const vercelHost = process.env.VERCEL_URL?.trim();
  if (vercelHost) {
    const host = vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}`;
  }

  const port = process.env.PORT || '3000';
  return `http://localhost:${port}`;
}
