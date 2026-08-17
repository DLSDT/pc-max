import { config } from '../config';

/**
 * Monitoring (Phase 18) — Sentry integration point.
 *
 * Active only when SENTRY_DSN is configured. Every payload is passed through
 * a redactor before leaving the process:
 *   - Authorization / refresh / password / resetToken fields are stripped.
 *   - Emails are partially masked (buffy***@example.com).
 *   - Query strings keep only the path.
 *
 * The rest of the codebase calls captureError() / captureMessage() so the
 * integration can be swapped for another provider without touching callers.
 */

type CaptureContext = Record<string, unknown>;

function redactValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase();
  if (k.includes('password') || k.includes('token') || k.includes('authorization') || k.includes('cookie')) return '[REDACTED]';
  if (k.includes('email') && typeof value === 'string') {
    const at = value.indexOf('@');
    if (at > 1) return `${value.slice(0, 3)}***${value.slice(at)}`;
  }
  return value;
}

export function redact(data: unknown, depth = 0): unknown {
  if (depth > 5 || data == null) return data;
  if (Array.isArray(data)) return data.map((v) => redact(v, depth + 1));
  if (typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = redactValue(k, v) ?? redact(v, depth + 1);
    }
    return out;
  }
  return data;
}

let initialized = false;

export function initMonitoring(): void {
  if (initialized || !config.SENTRY_DSN) return;
  initialized = true;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENV,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    beforeSend(event: { request?: { headers?: unknown; data?: unknown; url?: unknown }; user?: { email?: unknown }; extra?: unknown }) {
      if (event.request?.headers) event.request.headers = redact(event.request.headers) as never;
      if (event.request?.data) event.request.data = redact(event.request.data) as never;
      if (event.request?.url && typeof event.request.url === 'string') {
        event.request.url = event.request.url.split('?')[0]!;
      }
      if (event.user?.email) event.user.email = redactValue('email', event.user.email) as string;
      if (event.extra) event.extra = redact(event.extra) as never;
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.log(`📡 Sentry monitoring enabled (${config.SENTRY_ENV})`);
}

/** Capture an exception (no-op unless SENTRY_DSN is configured). */
export function captureError(err: unknown, context?: CaptureContext): void {
  if (!initialized || !config.SENTRY_DSN) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.captureException(err, { extra: redact(context ?? {}) });
}

export function captureMessage(message: string, context?: CaptureContext): void {
  if (!initialized || !config.SENTRY_DSN) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.captureMessage(message, { extra: redact(context ?? {}) });
}
