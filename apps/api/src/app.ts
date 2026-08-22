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
import { authUserModule } from './modules/auth-user';
import { usersModule } from './modules/users';
import { favoritesModule } from './modules/favorites';
import { subscriptionsModule } from './modules/subscriptions';
import { paymentsModule } from './modules/payments';
import { adminUsersModule } from './modules/admin-users';
import { adminSubscriptionsModule } from './modules/admin-subscriptions';
import { packagesModule } from './modules/packages';
import { mfgToolsModule } from './modules/mfg-tools';
import { adminPackagesModule } from './modules/admin-packages';
import { hardwareModule } from './modules/hardware';
import { adminDevicesModule } from './modules/admin-devices';
import { adminSecurityModule } from './modules/admin-security';
import { adminEmailModule } from './modules/admin-email';
import { adminSettingsModule } from './modules/admin-settings';
import { deviceModule } from './modules/device';
import { publicGamesModule } from './modules/public-games';
import { publicOptimizationsModule } from './modules/public-optimizations';
import { publicOptimizedSettingModule } from './modules/public-optimized-setting';
import { syncModule } from './modules/sync';
import { systemModule } from './modules/system';
import { uploadsModule } from './modules/uploads';
import { adminGamesModule } from './modules/admin-games';
import { adminOptimizationsModule } from './modules/admin-optimizations';
import { adminTaxonomyModule } from './modules/admin-taxonomy';
import { adminUsersModule as adminAccountsModule } from './modules/admin-admins';
import { adminAnalyticsModule } from './modules/admin-analytics';
import { adminAuditModule } from './modules/admin-audit';
import { clientErrorsModule } from './modules/client-errors';
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

  // JSON with an empty body (e.g. bodyless DELETE/POST with the json
  // content-type) is legitimate — parse it as {} instead of erroring.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    const buf = body as Buffer;
    if (!buf || buf.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(buf.toString('utf8')));
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      e.statusCode = 400; // malformed JSON → 400, never 500
      done(e);
    }
  });

  // Binary uploads (images + optimization package files). Fastify 415s unknown
  // content-types unless a parser is registered; we buffer the body and let
  // the upload handlers write it to storage (S3 presign bypasses this).
  // Hand the routes the raw stream instead of a Buffer. Buffering meant a
  // package upload was held entirely in memory AND capped by Fastify's 1 MB
  // default bodyLimit — so the advertised 500 MB ceiling was fiction and every
  // real package file came back 413. The upload handlers pipe straight to disk
  // and enforce their own size limit from content-length.
  for (const ct of ['application/octet-stream', 'application/zip', 'application/x-tar', 'image/jpeg', 'image/png', 'image/webp']) {
    app.addContentTypeParser(ct, (_request, payload, done) => {
      done(null, payload);
    });
  }

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

  // Serve locally uploaded files (local storage driver only). Package files
  // are NEVER served from the public static root — they are only reachable
  // through the signed /api/v1/uploads/signed/ route. Mirrors production
  // where the S3 bucket is private and downloads are presigned GETs.
  if (config.STORAGE_DRIVER === 'local') {
    app.addHook('onRequest', (request, reply, done) => {
      if (request.raw.url?.startsWith('/uploads/packages/')) {
        void reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Package files require a signed download link', details: null },
        });
        return;
      }
      done();
    });
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
  await api.register(publicOptimizedSettingModule, { prefix: '/api/v1' });
  await api.register(syncModule, { prefix: '/api/v1' });
  await api.register(uploadsModule, { prefix: '/api/v1' });

  await api.register(authModule, { prefix: '/api/v1' });
  await api.register(authUserModule, { prefix: '/api/v1' });
  await api.register(usersModule, { prefix: '/api/v1' });
  await api.register(favoritesModule, { prefix: '/api/v1' });
  await api.register(subscriptionsModule, { prefix: '/api/v1' });
  await api.register(paymentsModule, { prefix: '/api/v1' });
  await api.register(adminUsersModule, { prefix: '/api/v1' });
  await api.register(adminSubscriptionsModule, { prefix: '/api/v1' });
  await api.register(packagesModule, { prefix: '/api/v1' });
  await api.register(mfgToolsModule, { prefix: '/api/v1' });
  await api.register(adminPackagesModule, { prefix: '/api/v1' });
  await api.register(hardwareModule, { prefix: '/api/v1' });
  await api.register(adminDevicesModule, { prefix: '/api/v1' });
  await api.register(adminSecurityModule, { prefix: '/api/v1' });
  await api.register(adminSettingsModule, { prefix: '/api/v1' });
  await api.register(adminEmailModule, { prefix: '/api/v1' });
  await api.register(adminGamesModule, { prefix: '/api/v1' });
  await api.register(adminOptimizationsModule, { prefix: '/api/v1' });
  await api.register(adminTaxonomyModule, { prefix: '/api/v1' });
  await api.register(adminAccountsModule, { prefix: '/api/v1' });
  await api.register(adminAnalyticsModule, { prefix: '/api/v1' });
  await api.register(adminAuditModule, { prefix: '/api/v1' });
  await api.register(clientErrorsModule, { prefix: '/api/v1' });
  await api.register(adminReleasesModule, { prefix: '/api/v1' });

  return app;
}

export { AppError, notFoundError };
