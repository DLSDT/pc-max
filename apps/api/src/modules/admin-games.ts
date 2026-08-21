import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AdminGameListResponse,
  GameCreateInput,
  GameDetail,
  GameImageInput,
  GameRequirementsInput,
  GameUpdateInput,
  PublishInput,
  ImageType,
} from '@goh/validation';
import { idImageParams, idParams } from '../lib/params';
import { okSchema } from '../lib/schemas';
import { db } from '../db';
import {
  categories,
  gameCategories,
  gameImages,
  gameRequirements,
  games,
  gameTags,
  optimizationProfiles,
  tags,
} from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { catalogCache } from '../lib/ttl-cache';
import { requirePermission } from '../lib/auth-middleware';
import { ok, paginationMeta } from '../lib/http';
import { anyObjectSchema } from '../lib/schemas';
import { storage } from '../lib/storage';
import {
  attachGameMetadata,
  DEFAULT_TECHNOLOGIES,
  findGameById,
  iso,
  toSummary,
} from '../services/games';
import type { GameRow } from '../services/games';

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function scrub(row: GameRow): Record<string, unknown> {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    featured: row.featured,
    developer: row.developer,
    publisher: row.publisher,
    engine: row.engine,
    api: row.api,
    releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
    technologies: row.technologies,
    performanceRating: row.performanceRating,
  };
}

async function ensureUniqueSlug(slug: string, excludeId?: string) {
  const existing = await db.query.games.findFirst({
    where: and(eq(sql`lower(${games.slug})`, slug.toLowerCase()), excludeId ? sql`${games.id} <> ${excludeId}` : undefined),
  });
  if (existing) throw conflict(`A game with slug "${slug}" already exists`);
}

async function linkCategories(gameId: string, slugs: string[]) {
  await db.delete(gameCategories).where(eq(gameCategories.gameId, gameId));
  if (!slugs.length) return;
  const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, slugs));
  const found = new Set(rows.map((r) => r.slug));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length) throw notFound(`Category "${missing.join(', ')}"`);
  await db.insert(gameCategories).values(rows.map((r) => ({ gameId, categoryId: r.id })));
}

async function linkTags(gameId: string, slugs: string[]) {
  await db.delete(gameTags).where(eq(gameTags.gameId, gameId));
  if (!slugs.length) return;
  const existing = await db.select().from(tags).where(inArray(tags.slug, slugs));
  const bySlug = new Map(existing.map((t) => [t.slug, t]));
  const created = await Promise.all(
    slugs
      .filter((s) => !bySlug.has(s))
      .map((s) => db.insert(tags).values({ slug: s, name: s }).onConflictDoNothing().returning()),
  );
  for (const row of created) {
    if (row[0]) bySlug.set(row[0].slug, row[0]);
  }
  const linkRows = slugs
    .map((s) => bySlug.get(s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({ gameId, tagId: t.id }));
  if (linkRows.length) await db.insert(gameTags).values(linkRows);
}

export async function adminGamesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/games',
    {
      preHandler: [requirePermission('games.read')],
      schema: {
        querystring: z.object({
          q: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(24),
        }),
        response: { 200: AdminGameListResponse },
      },
    },
    async (request) => {
      const { q, page, limit } = request.query;

      const where = [isNull(games.deletedAt)];
      if (q) {
        const match = or(ilike(games.name, `%${q}%`), ilike(games.slug, `%${q}%`));
        if (match) where.push(match);
      }

      const [totalRows, rows] = await Promise.all([
        db.select({ n: count() }).from(games).where(and(...where)),
        db
          .select()
          .from(games)
          .where(and(...where))
          .orderBy(desc(games.updatedAt), asc(games.id))
          .limit(limit)
          .offset((page - 1) * limit),
      ]);

      const enriched = await attachGameMetadata(rows);
      const profileCounts = await db
        .select({ gameId: optimizationProfiles.gameId, n: count() })
        .from(optimizationProfiles)
        .where(and(inArray(optimizationProfiles.gameId, rows.map((r) => r.id)), isNull(optimizationProfiles.deletedAt)))
        .groupBy(optimizationProfiles.gameId);
      const countByGame = new Map(profileCounts.map((p) => [p.gameId, Number(p.n)]));

      return ok(
        enriched.map((row) => ({
          ...toSummary(row),
          developer: row.developer,
          publisher: row.publisher,
          releaseDate: row.releaseDate ? row.releaseDate.toISOString() : null,
          viewCount: row.viewCount,
          profileCount: countByGame.get(row.id) ?? 0,
          createdAt: iso(row.createdAt)!,
          updatedAt: iso(row.updatedAt)!,
        })),
        paginationMeta(page, limit, Number(totalRows[0]?.n ?? 0)),
      );
    },
  );

  typed.get(
    '/admin/games/:id',
    {
      preHandler: [requirePermission('games.read')],
      schema: {
        params: idParams,
        response: { 200: GameDetail },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const [enriched] = await attachGameMetadata([game]);
      if (!enriched) throw notFound('Game');

      const [imageRows, reqRows] = await Promise.all([
        db.select().from(gameImages).where(eq(gameImages.gameId, game.id)).orderBy(asc(gameImages.sortOrder)),
        db.select().from(gameRequirements).where(eq(gameRequirements.gameId, game.id)),
      ]);

      return {
        ...toSummary(enriched),
        description: game.description,
        developer: game.developer,
        publisher: game.publisher,
        releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
        images: imageRows.map((img) => ({
          id: img.id,
          type: img.type,
          url: img.url,
          objectKey: img.objectKey,
          altText: img.altText,
          sortOrder: img.sortOrder,
        })),
        requirements: reqRows
          .map((r) => ({
            tier: r.tier,
            os: r.os,
            cpu: r.cpu,
            gpu: r.gpu,
            ramGb: r.ramGb,
            storageGb: r.storageGb,
            directx: r.directx,
            notes: r.notes,
          }))
          .sort((a, b) => (a.tier === 'minimum' ? -1 : 1)),
        tags: (enriched as unknown as { _tags?: { slug: string; name: string }[] })._tags ?? [],
        executables: game.executables ?? [],
        steamAppId: game.steamAppId ?? null,
        epicAppId: game.epicAppId ?? null,
        launcher: game.launcher ?? null,
        viewCount: game.viewCount,
        createdAt: iso(game.createdAt)!,
        updatedAt: iso(game.updatedAt)!,
      };
    },
  );

  typed.post(
    '/admin/games',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        body: GameCreateInput,
        response: { 201: GameDetail },
      },
    },
    async (request, reply) => {
      const input = request.body;
      await ensureUniqueSlug(input.slug);

      const inserted = await db
        .insert(games)
        .values({
          name: input.name,
          slug: input.slug,
          tagline: input.tagline ?? null,
          description: input.description ?? null,
          developer: input.developer ?? null,
          publisher: input.publisher ?? null,
          releaseDate: parseDate(input.releaseDate),
          engine: input.engine ?? null,
          api: input.api ?? null,
          technologies: { ...DEFAULT_TECHNOLOGIES, ...input.technologies },
          performanceRating: input.performanceRating,
          executables: input.executables ?? [],
          steamAppId: input.steamAppId ?? null,
          epicAppId: input.epicAppId ?? null,
          launcher: input.launcher ?? null,
          featured: input.featured,
          status: input.status,
        })
        .returning();
      const game = inserted[0]!;

      await linkCategories(game.id, input.genreSlugs);
      await linkTags(game.id, input.tagSlugs);
      await recordAudit(request, { action: 'game.create', entityType: 'game', entityId: game.id, after: scrub(game) });
      await catalogCache.invalidate('games:');
      await catalogCache.invalidate('home');

      void reply.code(201);
      return getDetail(game.id);
    },
  );

  typed.patch(
    '/admin/games/:id',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        params: idParams,
        body: GameUpdateInput,
        response: { 200: GameDetail },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const input = request.body;
      if (input.slug && input.slug !== game.slug) await ensureUniqueSlug(input.slug, game.id);

      const patch: Record<string, unknown> = {};
      for (const key of [
        'name', 'slug', 'tagline', 'description', 'developer', 'publisher',
        'engine', 'api', 'performanceRating', 'executables', 'steamAppId',
        'epicAppId', 'launcher', 'featured', 'status',
      ] as const) {
        if (input[key] !== undefined) patch[key] = input[key];
      }
      if (input.releaseDate !== undefined) patch.releaseDate = parseDate(input.releaseDate);
      if (input.technologies !== undefined) {
        patch.technologies = { ...game.technologies, ...input.technologies };
      }

      const before = scrub(game);
      const updated = await db.update(games).set({ ...patch, updatedAt: new Date() }).where(eq(games.id, game.id)).returning();
      const updatedGame = updated[0]!;

      if (input.genreSlugs !== undefined) await linkCategories(game.id, input.genreSlugs);
      if (input.tagSlugs !== undefined) await linkTags(game.id, input.tagSlugs);

      await recordAudit(request, { action: 'game.update', entityType: 'game', entityId: game.id, before, after: scrub(updatedGame) });
      await catalogCache.invalidate('games:');
      await catalogCache.invalidate('home');
      return getDetail(game.id);
    },
  );

  typed.delete(
    '/admin/games/:id',
    {
      preHandler: [requirePermission('games.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      await db.update(games).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(games.id, game.id));
      await recordAudit(request, { action: 'game.delete', entityType: 'game', entityId: game.id, before: scrub(game) });
      await catalogCache.invalidate('games:');
      await catalogCache.invalidate('home');
      return { ok: true };
    },
  );

  typed.post(
    '/admin/games/:id/publish',
    {
      preHandler: [requirePermission('games.publish')],
      schema: {
        params: idParams,
        body: PublishInput,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const before = scrub(game);
      await db.update(games).set({ status: request.body.status, updatedAt: new Date() }).where(eq(games.id, game.id));
      await recordAudit(request, { action: 'game.publish', entityType: 'game', entityId: game.id, before, after: { status: request.body.status } });
      await catalogCache.invalidate('games:');
      await catalogCache.invalidate('home');
      return { ok: true };
    },
  );

  typed.post(
    '/admin/games/:id/images',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        params: idParams,
        body: GameImageInput,
        response: { 201: anyObjectSchema },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const { type, objectKey, altText } = request.body;
      const publicUrl = storage.publicUrl(objectKey);
      const existing = await db.query.gameImages.findFirst({
        where: and(eq(gameImages.gameId, game.id), eq(gameImages.type, type as ImageType)),
      });
      const sortOrder = existing ? existing.sortOrder + 1 : 0;

      const inserted = await db
        .insert(gameImages)
        .values({ gameId: game.id, type, url: publicUrl, objectKey, altText: altText ?? null, sortOrder })
        .returning();
      const img = inserted[0]!;
      await db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, game.id));
      await recordAudit(request, { action: 'game.image.add', entityType: 'game', entityId: game.id, after: { imageId: img.id, type, objectKey } });
      return { id: img.id, type: img.type, url: img.url, objectKey: img.objectKey, altText: img.altText, sortOrder: img.sortOrder };
    },
  );

  typed.delete(
    '/admin/games/:id/images/:imageId',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        params: idImageParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const image = await db.query.gameImages.findFirst({
        where: and(eq(gameImages.id, request.params.imageId), eq(gameImages.gameId, game.id)),
      });
      if (!image) throw notFound('Image');
      await db.delete(gameImages).where(eq(gameImages.id, image.id));
      await db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, game.id));
      await recordAudit(request, { action: 'game.image.remove', entityType: 'game', entityId: game.id, before: { imageId: image.id, type: image.type } });
      return { ok: true };
    },
  );

  typed.put(
    '/admin/games/:id/requirements',
    {
      preHandler: [requirePermission('games.write')],
      schema: {
        params: idParams,
        body: GameRequirementsInput,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const game = await findGameById(request.params.id);
      const { minimum, recommended } = request.body;

      for (const [tier, spec] of [
        ['minimum', minimum],
        ['recommended', recommended],
      ] as const) {
        if (!spec) continue;
        const existing = await db.query.gameRequirements.findFirst({
          where: and(eq(gameRequirements.gameId, game.id), eq(gameRequirements.tier, tier)),
        });
        const values = { ...spec, gameId: game.id, tier };
        if (existing) {
          await db.update(gameRequirements).set({ ...values, updatedAt: new Date() }).where(eq(gameRequirements.id, existing.id));
        } else {
          await db.insert(gameRequirements).values(values);
        }
      }

      await db.update(games).set({ updatedAt: new Date() }).where(eq(games.id, game.id));
      await recordAudit(request, { action: 'game.requirements.update', entityType: 'game', entityId: game.id, after: { minimum, recommended } });
      return { ok: true };
    },
  );
}

/** Shared detail fetch used by create/patch responses. */
async function getDetail(id: string) {
  const game = await findGameById(id);
  const [enriched] = await attachGameMetadata([game]);
  const [imageRows, reqRows] = await Promise.all([
    db.select().from(gameImages).where(eq(gameImages.gameId, game.id)).orderBy(asc(gameImages.sortOrder)),
    db.select().from(gameRequirements).where(eq(gameRequirements.gameId, game.id)),
  ]);
  return {
    ...toSummary(enriched!),
    description: game.description,
    developer: game.developer,
    publisher: game.publisher,
    releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
    executables: game.executables ?? [],
    steamAppId: game.steamAppId ?? null,
    epicAppId: game.epicAppId ?? null,
    launcher: game.launcher ?? null,
    images: imageRows.map((img) => ({ id: img.id, type: img.type, url: img.url, objectKey: img.objectKey, altText: img.altText, sortOrder: img.sortOrder })),
    requirements: reqRows.map((r) => ({ tier: r.tier, os: r.os, cpu: r.cpu, gpu: r.gpu, ramGb: r.ramGb, storageGb: r.storageGb, directx: r.directx, notes: r.notes })).sort((a, b) => (a.tier === 'minimum' ? -1 : 1)),
    tags: (enriched as unknown as { _tags?: { slug: string; name: string }[] })._tags ?? [],
    viewCount: game.viewCount,
    createdAt: iso(game.createdAt)!,
    updatedAt: iso(game.updatedAt)!,
  };
}
