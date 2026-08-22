import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PackageDownloadResponse, PackageKind, PackageListResponse } from '@goh/validation';
import { db } from '../db';
import { games, optimizationPackages } from '../db/schema';
import { authenticateUser } from '../lib/auth-middleware';
import { notFound } from '../lib/errors';
import { requireFeature } from '../lib/feature-gate';
import { storage } from '../lib/storage';
import { config } from '../config';
import { findPackageBySlug, listPackageFiles, toPackagePublic } from '../services/packages';

export async function packagesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Published packages for a game (public — storefront browsing).
  typed.get(
    '/games/:slug/packages',
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({ kind: PackageKind.optional() }),
        response: { 200: PackageListResponse },
      },
    },
    async (request) => {
      const game = await db.query.games.findFirst({
        where: and(eq(games.slug, request.params.slug), eq(games.status, 'published'), isNull(games.deletedAt)),
      });
      if (!game) throw notFound('Game');

      const { kind } = request.query;
      const rows = await db
        .select()
        .from(optimizationPackages)
        .where(
          and(
            eq(optimizationPackages.gameId, game.id),
            eq(optimizationPackages.status, 'published'),
            isNull(optimizationPackages.deletedAt),
            kind ? eq(optimizationPackages.kind, kind) : undefined,
          ),
        );
      return { data: rows.map(toPackagePublic) };
    },
  );

  // Package detail with manifest (no download URLs — those are gated).
  typed.get(
    '/games/:slug/packages/:packageSlug',
    {
      schema: { params: z.object({ slug: z.string(), packageSlug: z.string() }) },
    },
    async (request) => {
      const game = await db.query.games.findFirst({
        where: and(eq(games.slug, request.params.slug), isNull(games.deletedAt)),
      });
      if (!game) throw notFound('Game');
      const pkg = await findPackageBySlug(game.id, request.params.packageSlug);
      if (!pkg || pkg.status !== 'published') throw notFound('Optimization package');

      const files = await listPackageFiles(pkg.id);
      return {
        package: toPackagePublic(pkg),
        manifest: files.map((f) => ({
          filename: f.filename,
          sha256: f.sha256,
          size: f.size,
          destination: f.destination,
          operation: f.operation,
          sortOrder: f.sortOrder,
        })),
      };
    },
  );

  // Entitlement-gated download. The desktop NEVER decides if the user is
  // premium — this endpoint checks the subscription server-side and only then
  // returns the manifest with per-file URLs.
  typed.post(
    '/games/:slug/packages/:packageSlug/download',
    {
      preHandler: [authenticateUser, requireFeature('multi_frame_generation')],
      schema: { params: z.object({ slug: z.string(), packageSlug: z.string() }), response: { 200: PackageDownloadResponse } },
    },
    async (request) => {
      const game = await db.query.games.findFirst({
        where: and(eq(games.slug, request.params.slug), isNull(games.deletedAt)),
      });
      if (!game) throw notFound('Game');
      const pkg = await findPackageBySlug(game.id, request.params.packageSlug);
      if (!pkg || pkg.status !== 'published') throw notFound('Optimization package');

      const files = await listPackageFiles(pkg.id);
      // Short-lived signed URLs (HMAC locally, presigned GET on S3) — the bare
      // object is never public. Expiry is re-validated server-side on fetch.
      const signed = await Promise.all(files.map((f) => storage.signDownload(f.storageKey, config.DOWNLOAD_URL_TTL)));
      return {
        package: toPackagePublic(pkg),
        files: files.map((f, i) => ({
          filename: f.filename,
          sha256: f.sha256,
          size: f.size,
          destination: f.destination,
          operation: f.operation,
          url: signed[i]!,
          expiresIn: config.DOWNLOAD_URL_TTL,
        })),
      };
    },
  );
}
