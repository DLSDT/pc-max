import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PresignUploadInput, PresignUploadResponse } from '@goh/validation';
import { config } from '../config';
import { badRequest, forbidden } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { resolveLocalPath, storage } from '../lib/storage';

const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

export async function uploadsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/admin/uploads/presign',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        body: PresignUploadInput,
        response: { 200: PresignUploadResponse },
      },
    },
    async (request) => {
      const { kind, contentType, size } = request.body;
      if (size > MAX_UPLOAD) throw badRequest(`Image too large (max ${MAX_UPLOAD / 1024 / 1024} MB)`);
      return storage.presignUpload(kind, contentType, size);
    },
  );

  // Local-driver ingestion endpoint. The objectKey acts as a capability token:
  // only callers that received it from /admin/uploads/presign can PUT here.
  typed.put(
    '/uploads/put/*',
    {
      schema: {},
    },
    async (request, reply) => {
      if (config.STORAGE_DRIVER !== 'local') throw forbidden('Upload endpoint is disabled when S3 storage is configured');

      const key = String((request.params as Record<string, unknown>)['*'] ?? '');
      if (!key) throw badRequest('Missing object key');
      const ext = key.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXT.has(ext)) throw badRequest('Unsupported file type');
      if (key.includes('..')) throw badRequest('Invalid key');

      const contentLength = Number(request.headers['content-length'] ?? 0);
      if (!contentLength || contentLength > MAX_UPLOAD) throw badRequest('Invalid content length');

      const diskPath = resolveLocalPath(key);
      mkdirSync(dirname(diskPath), { recursive: true });
      const tmpPath = `${diskPath}.${randomUUID()}.tmp`;
      await pipeline(request.raw, createWriteStream(tmpPath, { mode: 0o644 }));
      await import('node:fs/promises').then((fs) => fs.rename(tmpPath, diskPath));

      void reply.status(201).send({ ok: true, key });
    },
  );
}
