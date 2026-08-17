import type { FastifyReply } from 'fastify';

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
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);

/** Central error handler — always responds with the `{ error }` envelope. */
export function errorHandler(
  error: unknown,
  request: { id: string; method: string; url: string },
  reply: FastifyReply,
) {
  const logger = (request as { log?: unknown }).log;
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

  void reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      details: null,
    },
  });
}


