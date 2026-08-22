import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  OptimizationPackageInput,
  OptimizationPackageUpdateInput,
  PackageFileCompleteInput,
  PackageKind,
  PackagePresignInput,
  PackagePublishInput,
} from '@goh/validation';
import { config } from '../config';
import { db } from '../db';
import { games, optimizationPackages, optimizationPackageVersions, packageFiles } from '../db/schema';
import { badRequest, notFound , forbidden } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';
import { resolveLocalPath, storage , verifySignedUpload } from '../lib/storage';
import { assertSafeFilename, assertSafeRoleDestination, findPackageById, PACKAGE_EXT, listPackageFiles, publishPackage, toPackagePublic } from '../services/packages';

const MAX_PACKAGE_FILE = 500 * 1024 * 1024; // 500 MB
/**
 * The upload gate. Shares PACKAGE_EXT with the service rather than keeping a
 * second copy — the two had already drifted (one listed `dll64`, the other did
 * not), which is exactly how a security list stops meaning anything.
 */
function isValidPackageExt(filename: string): boolean {
  return PACKAGE_EXT.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

/** SHA-256 of a file on disk (authoritative — the server computes it). */
function sha256File(diskPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(diskPath);
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function adminPackagesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ------------------------------------------------------------ list / CRUD

  typed.get(
    '/admin/packages',
    {
      preHandler: [requirePermission('packages.read')],
      schema: {
        querystring: z.object({
          gameId: z.string().uuid().optional(),
          status: z.enum(['draft', 'published', 'archived']).optional(),
          kind: PackageKind.optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (request) => {
      const { gameId, status, kind, page, limit } = request.query;
      const offset = (page - 1) * limit;
      const where = and(
        isNull(optimizationPackages.deletedAt),
        gameId ? eq(optimizationPackages.gameId, gameId) : undefined,
        status ? eq(optimizationPackages.status, status) : undefined,
        kind ? eq(optimizationPackages.kind, kind) : undefined,
      );

      const totalRows = await db.select({ value: count() }).from(optimizationPackages).where(where);
      const rows = await db
        .select({
          id: optimizationPackages.id,
          gameId: optimizationPackages.gameId,
          name: optimizationPackages.name,
          slug: optimizationPackages.slug,
          version: optimizationPackages.version,
          status: optimizationPackages.status,
          kind: optimizationPackages.kind,
          gpuVendor: optimizationPackages.gpuVendor,
          gpuFamily: optimizationPackages.gpuFamily,
          targetResolution: optimizationPackages.targetResolution,
          targetFps: optimizationPackages.targetFps,
          updatedAt: optimizationPackages.updatedAt,
          gameName: games.name,
        })
        .from(optimizationPackages)
        // leftJoin, not innerJoin: a global package has no game, and an inner
        // join silently drops it from the list while `count()` still includes
        // it — so the panel showed "1 package" above an empty table and there
        // was no way to reach an uploaded OptiFlow payload.
        .leftJoin(games, eq(optimizationPackages.gameId, games.id))
        .where(where)
        .orderBy(desc(optimizationPackages.updatedAt), asc(optimizationPackages.id))
        .limit(limit)
        .offset(offset);

      return {
        data: rows.map((r) => ({
          id: r.id,
          gameId: r.gameId,
          gameName: r.gameName,
          name: r.name,
          slug: r.slug,
          version: r.version,
          status: r.status,
          kind: r.kind,
          gpuVendor: r.gpuVendor,
          gpuFamily: r.gpuFamily,
          targetResolution: r.targetResolution,
          targetFps: r.targetFps,
          updatedAt: r.updatedAt.toISOString(),
        })),
        meta: { page, limit, total: totalRows[0]?.value ?? 0 },
      };
    },
  );

  typed.get(
    '/admin/packages/:id',
    {
      preHandler: [requirePermission('packages.read')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      return toPackagePublic(pkg);
    },
  );

  typed.post(
    '/admin/packages',
    {
      preHandler: [requirePermission('packages.write')],
      // gameId is optional: OptiFlow and OptiScaler payloads are the same bytes
      // for every game, so they are published once with no game attached.
      schema: { body: z.object({ gameId: z.string().uuid().nullish() }).merge(OptimizationPackageInput) },
    },
    async (request, reply) => {
      const { gameId: rawGameId, ...body } = request.body;
      const gameId = rawGameId ?? null;
      if (gameId) {
        const game = await db.query.games.findFirst({ where: and(eq(games.id, gameId), isNull(games.deletedAt)) });
        if (!game) throw notFound('Game');
      }

      const clash = await db.query.optimizationPackages.findFirst({
        where: and(
          gameId ? eq(optimizationPackages.gameId, gameId) : isNull(optimizationPackages.gameId),
          eq(optimizationPackages.slug, body.slug),
        ),
      });
      if (clash) throw badRequest(gameId ? 'A package with this slug already exists for this game' : 'A global package with this slug already exists');

      const [row] = await db
        .insert(optimizationPackages)
        .values({
          gameId,
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          kind: body.kind,
          gpuVendor: body.gpuVendor,
          gpuFamily: body.gpuFamily ?? null,
          minVramMb: body.minVramMb ?? null,
          minRamGb: body.minRamGb ?? null,
          minWindows: body.minWindows ?? null,
          gameVersion: body.gameVersion ?? null,
          arch: body.arch,
          targetResolution: body.targetResolution ?? null,
          targetFps: body.targetFps ?? null,
          isDefault: body.isDefault,
        })
        .returning();
      await recordAudit(request, { action: 'package.create', entityType: 'optimization_package', entityId: row!.id, after: { name: body.name, gameId } });
      void reply.code(201);
      return toPackagePublic(row!);
    },
  );

  typed.patch(
    '/admin/packages/:id',
    {
      preHandler: [requirePermission('packages.write')],
      schema: { params: z.object({ id: z.string().uuid() }), body: OptimizationPackageUpdateInput },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');

      const body = request.body;
      const patch: Record<string, unknown> = {};
      for (const key of ['name', 'slug', 'description', 'kind', 'gpuVendor', 'gpuFamily', 'minVramMb', 'minRamGb', 'minWindows', 'gameVersion', 'arch', 'targetResolution', 'targetFps', 'isDefault'] as const) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      patch.updatedAt = new Date();

      if (patch.slug && patch.slug !== pkg.slug) {
        const clash = await db.query.optimizationPackages.findFirst({
          where: and(
            pkg.gameId ? eq(optimizationPackages.gameId, pkg.gameId) : isNull(optimizationPackages.gameId),
            eq(optimizationPackages.slug, patch.slug as string),
          ),
        });
        if (clash) throw badRequest(pkg.gameId ? 'A package with this slug already exists for this game' : 'A global package with this slug already exists');
      }

      const [row] = await db.update(optimizationPackages).set(patch).where(eq(optimizationPackages.id, pkg.id)).returning();
      await recordAudit(request, { action: 'package.update', entityType: 'optimization_package', entityId: pkg.id, before: { version: pkg.version }, after: patch });
      return toPackagePublic(row!);
    },
  );

  typed.delete(
    '/admin/packages/:id',
    {
      preHandler: [requirePermission('packages.delete')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      await db.update(optimizationPackages).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(optimizationPackages.id, pkg.id));
      await recordAudit(request, { action: 'package.delete', entityType: 'optimization_package', entityId: pkg.id, before: { name: pkg.name } });
      return { ok: true };
    },
  );

  typed.post(
    '/admin/packages/:id/archive',
    {
      preHandler: [requirePermission('packages.publish')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      const [row] = await db.update(optimizationPackages).set({ status: 'archived', updatedAt: new Date() }).where(eq(optimizationPackages.id, pkg.id)).returning();
      await recordAudit(request, { action: 'package.archive', entityType: 'optimization_package', entityId: pkg.id });
      return toPackagePublic(row!);
    },
  );

  // ------------------------------------------------------------ publish

  typed.post(
    '/admin/packages/:id/publish',
    {
      preHandler: [requirePermission('packages.publish')],
      schema: { params: z.object({ id: z.string().uuid() }), body: PackagePublishInput },
    },
    async (request) => {
      const updated = await publishPackage(request.params.id, request.body.changeNote, request.admin!.id);
      await recordAudit(request, {
        action: 'package.publish',
        entityType: 'optimization_package',
        entityId: updated.id,
        after: { version: updated.version },
      });
      return toPackagePublic(updated);
    },
  );

  // ------------------------------------------------------------ files

  // Release history — every publish snapshots the manifest (for restore/audit).
  typed.get(
    '/admin/packages/:id/versions',
    {
      preHandler: [requirePermission('packages.read')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      const rows = await db
        .select()
        .from(optimizationPackageVersions)
        .where(eq(optimizationPackageVersions.packageId, pkg.id))
        .orderBy(desc(optimizationPackageVersions.createdAt));
      return {
        data: rows.map((r) => ({
          id: r.id,
          version: r.version,
          changeNote: r.changeNote,
          files: r.files,
          createdBy: r.createdBy,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },
  );

  typed.get(
    '/admin/packages/:id/files',
    {
      preHandler: [requirePermission('packages.read')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      return { data: await listPackageFiles(pkg.id) };
    },
  );

  typed.post(
    '/admin/packages/:id/files/presign',
    {
      preHandler: [requirePermission('packages.write')],
      schema: { params: z.object({ id: z.string().uuid() }), body: PackagePresignInput },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      assertSafeFilename(request.body.filename);
      if (request.body.size > MAX_PACKAGE_FILE) throw badRequest(`File too large (max ${MAX_PACKAGE_FILE / 1024 / 1024} MB)`);
      return storage.presignPackageUpload(request.body.filename, request.body.size);
    },
  );

  // Local-driver ingestion for package files (capability = server-issued key).
  typed.put(
    '/uploads/packages/put/:exp/:sig/*',
    { schema: { params: z.object({ exp: z.string(), sig: z.string(), '*': z.string() }) } },
    async (request, reply) => {
      if (config.STORAGE_DRIVER !== 'local') throw badRequest('Package upload endpoint is disabled when S3 storage is configured');
      const key = String((request.params as Record<string, unknown>)['*'] ?? '');
      if (!key.startsWith('packages/') || key.includes('..')) throw badRequest('Invalid object key');

      // Unauthenticated by design — the HMAC from presign is the authorisation.
      if (!verifySignedUpload(key, Number(request.params.exp), request.params.sig)) {
        throw forbidden('Invalid or expired upload URL');
      }
      const filename = key.split('/').pop() ?? '';
      if (!isValidPackageExt(filename)) throw badRequest('Unsupported file type');

      const contentLength = Number(request.headers['content-length'] ?? 0);
      if (!contentLength || contentLength > MAX_PACKAGE_FILE) throw badRequest('Invalid content length');

      const diskPath = resolveLocalPath(key);
      mkdirSync(dirname(diskPath), { recursive: true });
      const tmpPath = `${diskPath}.${randomUUID()}.tmp`;
      // Stream to disk — a package file can be hundreds of megabytes, and
      // buffering one would hold all of it in memory at once.
      await pipeline(request.raw, createWriteStream(tmpPath, { mode: 0o644 }));
      await import('node:fs/promises').then((fs) => fs.rename(tmpPath, diskPath));
      void reply.status(201).send({ ok: true, key });
    },
  );

  // Finalize: verify the object exists, compute SHA-256, add to the manifest.
  typed.post(
    '/admin/packages/:id/files/complete',
    {
      preHandler: [requirePermission('packages.write')],
      schema: { params: z.object({ id: z.string().uuid() }), body: PackageFileCompleteInput },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      const { storageKey, filename, size, destination, operation, role, variant } = request.body;

      assertSafeFilename(filename);
      // Role-aware: a streamline/launcher destination is a bare filename because
      // the directory is only known once the user picks their game.
      assertSafeRoleDestination(destination, role);
      if (size > MAX_PACKAGE_FILE) throw badRequest(`File too large (max ${MAX_PACKAGE_FILE / 1024 / 1024} MB)`);

      // Authoritative hash: local driver hashes the stored bytes; S3 hashes via GetObject.
      let sha256: string;
      if (config.STORAGE_DRIVER === 'local') {
        const diskPath = resolveLocalPath(storageKey);
        if (!existsSync(diskPath)) throw badRequest('Uploaded object not found — upload first');
        sha256 = await sha256File(diskPath);
      } else {
        const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const client = new S3Client({ region: config.S3_REGION, endpoint: config.S3_ENDPOINT || undefined, forcePathStyle: Boolean(config.S3_ENDPOINT) });
        const command = new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey });
        // Simplest correct hash: fetch the object and hash the stream.
        const presigned = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
        const res = await fetch(presigned);
        if (!res.ok || !res.body) throw badRequest('Uploaded object not found — upload first');
        const hash = createHash('sha256');
        for await (const chunk of res.body as unknown as AsyncIterable<Buffer>) hash.update(chunk);
        sha256 = hash.digest('hex');
      }

      const [row] = await db
        .insert(packageFiles)
        .values({ packageId: pkg.id, filename, sha256, size, destination, operation, role, variant: variant ?? null, storageKey })
        .returning();
      await recordAudit(request, { action: 'package.file_add', entityType: 'optimization_package', entityId: pkg.id, after: { filename, sha256, size } });
      return row;
    },
  );

  typed.delete(
    '/admin/packages/:id/files/:fileId',
    {
      preHandler: [requirePermission('packages.write')],
      schema: { params: z.object({ id: z.string().uuid(), fileId: z.string().uuid() }) },
    },
    async (request) => {
      const pkg = await findPackageById(request.params.id);
      if (!pkg) throw notFound('Optimization package');
      const file = await db.query.packageFiles.findFirst({
        where: and(eq(packageFiles.id, request.params.fileId), eq(packageFiles.packageId, pkg.id)),
      });
      if (!file) throw notFound('Package file');
      await db.delete(packageFiles).where(eq(packageFiles.id, file.id));
      await recordAudit(request, { action: 'package.file_remove', entityType: 'optimization_package', entityId: pkg.id, before: { filename: file.filename } });
      return { ok: true };
    },
  );
}
