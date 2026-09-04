import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GameDetail, GameListResponse, GamesQuery } from '@goh/validation';
import { slugParams } from '../lib/params';
import { dataListSchema } from '../lib/schemas';
import { HomeResponse } from '@goh/validation';
import { db } from '../db';
import { categories, gameCategories, gameImages, games, gameTags, gameRequirements, tags } from '../db/schema';
import { notFound } from '../lib/errors';
import { sanitizeSearchTerm } from '../lib/search';
import { paginationMeta } from '../lib/http';
import { catalogCache } from '../lib/ttl-cache';
import { config } from '../config';
import {
  attachGameMetadata,
  categoriesWithCounts,
  findPublishedGameBySlug,
  iso,
  publishedGameWhere,
  toSummary,
} from '../services/games';

export async function publicGamesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  async function listGames(q: string | undefined, genre: string | undefined, year: string | number | undefined, techs: string[] | undefined, sort: string | undefined, page: number, limit: number) {
    const where: ReturnType<typeof and>[] = [publishedGameWhere()];

    const term = sanitizeSearchTerm(q);
    if (term) {
      const pattern = `%${term}%`;
      const byTags = db
        .select({ gameId: gameTags.gameId })
        .from(gameTags)
        .innerJoin(tags, eq(gameTags.tagId, tags.id))
        .where(ilike(tags.name, pattern));
      const byGenres = db
        .select({ gameId: gameCategories.gameId })
        .from(gameCategories)
        .innerJoin(categories, eq(gameCategories.categoryId, categories.id))
        .where(ilike(categories.name, pattern));
      where.push(
        or(
          ilike(games.name, pattern),
          ilike(games.slug, pattern),
          ilike(games.tagline, pattern),
          ilike(games.developer, pattern),
          inArray(games.id, byTags),
          inArray(games.id, byGenres),
        )!,
      );
    }

    if (genre) {
      const genreIds = db
        .select({ gameId: gameCategories.gameId })
        .from(gameCategories)
        .innerJoin(categories, eq(gameCategories.categoryId, categories.id))
        .where(eq(categories.slug, genre));
      where.push(inArray(games.id, genreIds));
    }

    if (year) where.push(sql`extract(year from ${games.releaseDate}) = ${year}`);

    for (const tech of techs ?? []) {
      where.push(sql`(${games.technologies} ->> '${sql.raw(tech)}')::boolean = true`);
    }

    // Every sort key here is non-unique — imported games share a viewCount, a
    // null releaseDate and a placeholder rating — so ordering by it alone makes
    // LIMIT/OFFSET non-deterministic: Postgres is free to return a tied row on
    // two different pages while another never appears at all. `games.id` is the
    // stable tiebreaker that makes pagination total.
    const primaryOrder =
      sort === 'popular'
        ? desc(games.viewCount)
        : sort === 'new'
          ? desc(games.releaseDate)
          : sort === 'rating'
            ? desc(games.performanceRating)
            : asc(games.name);
    const orderBy = [primaryOrder, asc(games.id)];

    const totalRows = await db.select({ n: count() }).from(games).where(and(...where));
    const total = Number(totalRows[0]?.n ?? 0);

    const rows = await db
      .select()
      .from(games)
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset((page - 1) * limit);

    const enriched = await attachGameMetadata(rows);
    return {
      data: enriched.map(toSummary),
      meta: paginationMeta(page, limit, total),
    };
  }

  typed.get(
    '/games',
    {
      schema: { querystring: GamesQuery, response: { 200: GameListResponse } },
    },
    async (request) => {
      const { q, genre, year, techs, sort, page, limit } = request.query;
      return listGames(q, genre, year, techs, sort, page, limit);
    },
  );

  // Cached variant (Phase 16) — the storefront list is hot and read-mostly;
  // the desktop's offline-first sync uses it. TTL + Cache-Control headers keep
  // even the cold /games path from hammering PostgreSQL.
  typed.get(
    '/games/cached',
    {
      schema: { querystring: GamesQuery, response: { 200: GameListResponse } },
    },
    async (request, reply) => {
      const { q, genre, year, techs, sort, page, limit } = request.query;
      const payload = await catalogCache.get(`games:${request.url}`, () => listGames(q, genre, year, techs, sort, page, limit));
      void reply.header('cache-control', `public, max-age=${config.CATALOG_CACHE_TTL}`);
      return payload;
    },
  );

  typed.get(
    '/games/:slug',
    {
      schema: {
        params: slugParams,
        response: { 200: GameDetail },
      },
    },
    async (request) => {
      const game = await findPublishedGameBySlug(request.params.slug);
      const [enriched] = await attachGameMetadata([game]);
      if (!enriched) throw notFound('Game');

      const imageRows = await db
        .select()
        .from(gameImages)
        .where(eq(gameImages.gameId, game.id))
        .orderBy(gameImages.sortOrder);

      const reqRows = await db
        .select()
        .from(gameRequirements)
        .where(eq(gameRequirements.gameId, game.id));

      const summary = toSummary(enriched);
      return {
        ...summary,
        description: game.description,
        descriptionEn: game.descriptionEn,
        descriptionFa: game.descriptionFa,
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

  typed.get(
    '/featured',
    {
      schema: {
        // The dashboard renders a 6-wide row; the Recommended page renders a
        // full grid and asks for more, so the ceiling has to clear the whole
        // curated set rather than one row of it.
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(60).default(6) }),
        response: { 200: dataListSchema },
      },
    },
    async (request) => {
      const { limit } = request.query;
      const rows = await db
        .select()
        .from(games)
        .where(and(publishedGameWhere(), eq(games.featured, true)))
        // Imported games all share view_count 0, so ordering on it alone lets
        // Postgres return a different arbitrary slice on every request — the
        // page would reshuffle on each visit. Break the tie on a unique column.
        .orderBy(desc(games.viewCount), asc(games.id))
        .limit(limit);
      const enriched = await attachGameMetadata(rows);
      return { data: enriched.map(toSummary) };
    },
  );

  typed.get(
    '/categories',
    {
      schema: {
        response: { 200: dataListSchema },
      },
    },
    async () => ({ data: await categoriesWithCounts() }),
  );

  typed.get(
    '/home',
    {
      schema: {
        response: { 200: HomeResponse },
      },
    },
    async () => {
      const [featuredRows, popularRows, recentRows, cats] = await Promise.all([
        db
          .select()
          .from(games)
          .where(and(publishedGameWhere(), eq(games.featured, true)))
          .orderBy(desc(games.viewCount), asc(games.id))
          .limit(5),
        db
          .select()
          .from(games)
          .where(publishedGameWhere())
          .orderBy(desc(games.viewCount), asc(games.id))
          .limit(12),
        db
          .select()
          .from(games)
          .where(publishedGameWhere())
          .orderBy(desc(games.createdAt), asc(games.id))
          .limit(12),
        categoriesWithCounts(),
      ]);

      const [featured, popular, recent] = await Promise.all([
        attachGameMetadata(featuredRows),
        attachGameMetadata(popularRows),
        attachGameMetadata(recentRows),
      ]);

      return {
        featured: featured.map(toSummary),
        popular: popular.map(toSummary),
        recentlyAdded: recent.map(toSummary),
        categories: cats,
      };
    },
  );

  // Cached variant (Phase 16) — the desktop's offline-first sync hits this.
  typed.get(
    '/home/cached',
    {
      schema: {
        response: { 200: HomeResponse },
      },
    },
    async (_request, reply) => {
      const payload = await catalogCache.get('home', async () => {
        const [featuredRows, popularRows, recentRows, cats] = await Promise.all([
          db
            .select()
            .from(games)
            .where(and(publishedGameWhere(), eq(games.featured, true)))
            .orderBy(desc(games.viewCount), asc(games.id))
            .limit(5),
          db
            .select()
            .from(games)
            .where(publishedGameWhere())
            .orderBy(desc(games.viewCount), asc(games.id))
            .limit(12),
          db
            .select()
            .from(games)
            .where(publishedGameWhere())
            .orderBy(desc(games.createdAt), asc(games.id))
            .limit(12),
          categoriesWithCounts(),
        ]);
        const [featured, popular, recent] = await Promise.all([
          attachGameMetadata(featuredRows),
          attachGameMetadata(popularRows),
          attachGameMetadata(recentRows),
        ]);
        return {
          featured: featured.map(toSummary),
          popular: popular.map(toSummary),
          recentlyAdded: recent.map(toSummary),
          categories: cats,
        };
      });
      void reply.header('cache-control', `public, max-age=${config.CATALOG_CACHE_TTL}`);
      return payload;
    },
  );
}
