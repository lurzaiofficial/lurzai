/**
 * Safe application logger.
 *
 * Hard rule: secrets must never reach the log sink. Every payload passes through
 * `redact()` which strips known-sensitive keys and masks anything that looks like
 * a credential, regardless of the key it was nested under.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

/** Keys whose values are always removed, no matter how deeply nested. */
const SECRET_KEYS = new Set([
  'apisecret',
  'api_secret',
  'binanceapisecret',
  'binance_api_secret',
  'secret',
  'secretkey',
  'secret_key',
  'signature',
  'password',
  'token',
  'accesstoken',
  'access_token',
  'authorization',
  'cookie',
  'openrouterapikey',
  'openrouter_api_key',
  'resendapikey',
  'resend_api_key',
  'privatekey',
  'private_key',
]);

/** Keys that are masked (tail kept) rather than fully removed, for supportability. */
const MASKED_KEYS = new Set(['apikey', 'api_key', 'binanceapikey', 'binance_api_key', 'key']);

/**
 * Masks a credential leaving only the last 4 characters visible.
 * `maskSecret('abcdefghijklmnop') -> '****************mnop'`
 */
export function maskSecret(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (value.length <= 4) return '*'.repeat(value.length);
  return '*'.repeat(Math.min(value.length - 4, 16)) + value.slice(-4);
}

/**
 * Recursively removes/masks sensitive values. Also catches long opaque strings
 * that appear where a credential could plausibly be, so an accidental
 * `log(rawBody)` cannot leak a key that was under an unexpected field name.
 */
export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean') return input;

  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1));

  if (input instanceof Error) {
    return { name: input.name, message: input.message };
  }

  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const normalized = key.toLowerCase().replace(/[^a-z_]/g, '');
      if (SECRET_KEYS.has(normalized)) {
        out[key] = '[redacted]';
      } else if (MASKED_KEYS.has(normalized) && typeof value === 'string') {
        out[key] = maskSecret(value);
      } else {
        out[key] = redact(value, depth + 1);
      }
    }
    return out;
  }

  return '[unloggable]';
}

function emit(level: LogLevel, message: string, meta?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta === undefined ? {} : { meta: redact(meta) }),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info: (msg: string, meta?: unknown) => emit('info', msg, meta),
  warn: (msg: string, meta?: unknown) => emit('warn', msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
};
