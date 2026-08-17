import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { GameStatus } from '@goh/validation';
import { SyncQuery, SyncResponse } from '@goh/validation';
import { db } from '../db';
import { categories, games, optimizationProfiles } from '../db/schema';
import { iso } from '../services/games';

export async function syncModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/sync',
    {
      schema: {
        querystring: SyncQuery,
        response: { 200: SyncResponse },
      },
    },
    async (request) => {
      const { since } = request.query;
      const sinceDate = since ? new Date(since) : null;

      // The manifest is a mirror of what the PUBLIC API serves:
      //  - full sync (no `since`): everything currently visible,
      //  - incremental sync: rows that changed after `since`, where rows that
      //    are no longer publicly visible are flagged `deleted` so clients
      //    evict them from their cache (e.g. an admin unpublishes a game).
      const [gameRows, profileRows, categoryRows] = await Promise.all([
        db
          .select({
            id: games.id,
            slug: games.slug,
            status: games.status,
            updatedAt: games.updatedAt,
            deletedAt: games.deletedAt,
          })
          .from(games)
          .where(
            sinceDate
              ? or(gt(games.updatedAt, sinceDate), isNotNull(games.deletedAt))
              : and(eq(games.status, 'published'), isNull(games.deletedAt)),
          ),
        db
          .select({
            id: optimizationProfiles.id,
            gameId: optimizationProfiles.gameId,
            slug: optimizationProfiles.slug,
            version: optimizationProfiles.version,
            status: optimizationProfiles.status,
            updatedAt: optimizationProfiles.updatedAt,
            deletedAt: optimizationProfiles.deletedAt,
          })
          .from(optimizationProfiles)
          .where(
            sinceDate
              ? or(gt(optimizationProfiles.updatedAt, sinceDate), isNotNull(optimizationProfiles.deletedAt))
              : and(eq(optimizationProfiles.status, 'published'), isNull(optimizationProfiles.deletedAt)),
          ),
        db
          .select({ id: categories.id, slug: categories.slug, name: categories.name, updatedAt: categories.updatedAt })
          .from(categories)
          .where(sinceDate ? gt(categories.updatedAt, sinceDate) : undefined),
      ]);

      // Resolve slug + public visibility of each game (for the profile manifest).
      const profileGameIds = [...new Set(profileRows.map((p) => p.gameId))];
      type SyncGameRow = { slug: string; status: GameStatus; deletedAt: Date | null };
      const gameInfo = new Map<string, SyncGameRow>(gameRows.map((g) => [g.id, g]));
      if (profileGameIds.length) {
        const extra = await db
          .select({ id: games.id, slug: games.slug, status: games.status, updatedAt: games.updatedAt, deletedAt: games.deletedAt })
          .from(games)
          .where(inArray(games.id, profileGameIds));
        for (const g of extra) gameInfo.set(g.id, g);
      }

      const allTimestamps = [
        ...gameRows.map((r) => r.updatedAt),
        ...profileRows.map((r) => r.updatedAt),
        ...categoryRows.map((r) => r.updatedAt),
      ];
      const contentUpdatedAt = allTimestamps.length
        ? iso(new Date(Math.max(...allTimestamps.map((d) => new Date(d).getTime()))))
        : null;

      const gameVisible = (r: (typeof gameRows)[number]) =>
        Boolean(r.deletedAt) || r.status !== 'published';

      return {
        contentUpdatedAt,
        games: gameRows.map((r) => ({
          id: r.id,
          slug: r.slug,
          updatedAt: iso(r.updatedAt)!,
          deleted: gameVisible(r),
        })),
        profiles: profileRows.map((r) => {
          const game = gameInfo.get(r.gameId);
          const hidden =
            Boolean(r.deletedAt) ||
            r.status !== 'published' ||
            !game ||
            game.status !== 'published' ||
            Boolean(game.deletedAt);
          return {
            id: r.id,
            gameId: r.gameId,
            gameSlug: game?.slug ?? '',
            slug: r.slug,
            version: r.version,
            updatedAt: iso(r.updatedAt)!,
            deleted: hidden,
          };
        }),
        categories: categoryRows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          updatedAt: iso(r.updatedAt)!,
          deleted: false,
        })),
      };
    },
  );
}
