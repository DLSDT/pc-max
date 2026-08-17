import type { FastifyReply } from 'fastify';
import { captureError } from './monitoring';

/** Structured application error. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (entity: string) => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const tooManyRequests = (message = 'Too many requests') => new AppError(429, 'TOO_MANY_REQUESTS', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);

/** Central error handler — always responds with the `{ error }` envelope. */
export function errorHandler(
  error: unknown,
  request: { id: string; method: string; url: string },
  reply: FastifyReply,
) {
  const logger = (request as { log?: unknown }).log;
  // eslint-disable-next-line no-console
  if (process.env.NODE_ENV === 'test') console.error('TEST ERROR:', (error as Error)?.message);
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  // Body-parse failures (malformed/empty JSON, oversized payloads) -> 4xx, never 500.
  const ctErr = error as { code?: string };
  if (ctErr.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || ctErr.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
    void reply.status(400).send({
      error: { code: 'BAD_REQUEST', message: 'Invalid or empty JSON request body', details: null },
    });
    return;
  }
  if (ctErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    void reply.status(413).send({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', details: null },
    });
    return;
  }

  // Fastify-native client errors (e.g. @fastify/rate-limit throws a plain
  // Error with statusCode 429/403). Without this the custom error handler
  // would turn every rate-limited request into a 500 — and flood Sentry.
  const withStatus = error as { statusCode?: number };
  if (typeof withStatus.statusCode === 'number' && withStatus.statusCode >= 400 && withStatus.statusCode < 500) {
    const code = withStatus.statusCode === 429 ? 'RATE_LIMITED' : withStatus.statusCode === 403 ? 'FORBIDDEN' : 'REQUEST_REJECTED';
    void reply.status(withStatus.statusCode).send({
      error: { code, message: (error as Error)?.message ?? 'Request rejected', details: null },
    });
    return;
  }

  // Fastify/Zod validation failures -> 400 (not 500).
  const fastifyErr = error as { code?: string; validation?: unknown; message?: string };
  if (fastifyErr.code === 'FST_ERR_VALIDATION' || fastifyErr.validation) {
    void reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: fastifyErr.message ?? 'Request validation failed',
        details: fastifyErr.validation ?? null,
      },
    });
    return;
  }

  if (logger && typeof logger === 'object' && logger && 'error' in logger) {
    ((logger as { error: (msg: string) => void }).error)(
      `Unhandled error on ${request.method} ${request.url}: ${(error as Error)?.message}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.error(`Unhandled error on ${request.method} ${request.url}:`, error);
  }

  // Phase 18 — surface unhandled 500s to Sentry (redacted) when configured.
  captureError(error, { method: request.method, url: request.url });

  void reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      details: null,
    },
  });
}


