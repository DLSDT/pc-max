import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { config } from './config';
import { errorHandler, AppError, notFound as notFoundError } from './lib/errors';
import { authModule } from './modules/auth';
import { deviceModule } from './modules/device';
import { publicGamesModule } from './modules/public-games';
import { publicOptimizationsModule } from './modules/public-optimizations';
import { syncModule } from './modules/sync';
import { systemModule } from './modules/system';
import { uploadsModule } from './modules/uploads';
import { adminGamesModule } from './modules/admin-games';
import { adminOptimizationsModule } from './modules/admin-optimizations';
import { adminTaxonomyModule } from './modules/admin-taxonomy';
import { adminUsersModule } from './modules/admin-admins';
import { adminAnalyticsModule } from './modules/admin-analytics';
import { adminAuditModule } from './modules/admin-audit';
import { adminReleasesModule } from './modules/admin-releases';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    trustProxy: true,
  });

  // Zod compilers: all route schemas are Zod schemas (fastify-type-provider-zod).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // ------------------------------------------------------------- plugins
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP for the API responses is not applicable; clients manage their own.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  });

  await app.register(cookie);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Game Optimization Hub API',
        description: 'REST API for the Game Optimization Hub platform (desktop app + admin panel).',
        version: '0.1.0',
      },
      tags: [
        { name: 'public', description: 'Public endpoints consumed by the desktop app' },
        { name: 'admin', description: 'Admin endpoints (JWT + RBAC)' },
      ],
    },
    // Workaround for turkerdev/fastify-type-provider-zod#247: @fastify/swagger
    // crashes on zod params schemas. Runtime validation/types keep working;
    // only the generated docs omit path parameters.
    transform: (input) => {
      const out = jsonSchemaTransform(input);
      if (out.schema?.params) delete out.schema.params;
      return out;
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Serve locally uploaded files (local storage driver only).
  if (config.STORAGE_DRIVER === 'local') {
    await app.register(fastifyStatic, {
      root: path.resolve(config.UPLOAD_DIR),
      prefix: '/uploads/',
      decorateReply: false,
    });
  }

  // ------------------------------------------------------------- error handling
  app.setErrorHandler((error, request, reply) => errorHandler(error, request, reply));
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found`, details: null },
    });
  });

  // ------------------------------------------------------------- routes
  const api = app.withTypeProvider<ZodTypeProvider>();
  await api.register(systemModule, { prefix: '/api/v1' });
  await api.register(deviceModule, { prefix: '/api/v1' });
  await api.register(publicGamesModule, { prefix: '/api/v1' });
  await api.register(publicOptimizationsModule, { prefix: '/api/v1' });
  await api.register(syncModule, { prefix: '/api/v1' });
  await api.register(uploadsModule, { prefix: '/api/v1' });

  await api.register(authModule, { prefix: '/api/v1' });
  await api.register(adminGamesModule, { prefix: '/api/v1' });
  await api.register(adminOptimizationsModule, { prefix: '/api/v1' });
  await api.register(adminTaxonomyModule, { prefix: '/api/v1' });
  await api.register(adminUsersModule, { prefix: '/api/v1' });
  await api.register(adminAnalyticsModule, { prefix: '/api/v1' });
  await api.register(adminAuditModule, { prefix: '/api/v1' });
  await api.register(adminReleasesModule, { prefix: '/api/v1' });

  return app;
}

export { AppError, notFoundError };
