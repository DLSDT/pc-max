import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { FavoriteMutationResponse, FavoriteParams, GameListResponse } from '@goh/validation';
import { db } from '../db';
import { favorites, games } from '../db/schema';
import { notFound } from '../lib/errors';
import { authenticateUser } from '../lib/auth-middleware';
import { attachGameMetadata, toSummary } from '../services/games';

/**
 * User favorites — server-side, per-account (the desktop also keeps an offline
 * copy; the server is the source of truth once a user is signed in).
 */
export async function favoritesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/favorites',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: GameListResponse } },
    },
    async (request) => {
      const rows = await db
        .select({ game: games })
        .from(favorites)
        .innerJoin(games, eq(favorites.gameId, games.id))
        .where(and(eq(favorites.userId, request.user!.id), isNull(games.deletedAt)))
        .orderBy(favorites.createdAt);

      const gameRows = rows.map((r) => r.game);
      const enriched = await attachGameMetadata(gameRows);
      return { data: enriched.map(toSummary), meta: { total: enriched.length, page: 1, limit: 1000 } };
    },
  );

  typed.put(
    '/favorites/:gameId',
    {
      preHandler: [authenticateUser],
      schema: { params: FavoriteParams, response: { 200: FavoriteMutationResponse } },
    },
    async (request) => {
      const game = await db.query.games.findFirst({
        where: and(eq(games.id, request.params.gameId), isNull(games.deletedAt)),
      });
      if (!game) throw notFound('Game');

      await db
        .insert(favorites)
        .values({ userId: request.user!.id, gameId: game.id })
        .onConflictDoNothing();
      return { ok: true, favorited: true };
    },
  );

  typed.delete(
    '/favorites/:gameId',
    {
      preHandler: [authenticateUser],
      schema: { params: FavoriteParams, response: { 200: FavoriteMutationResponse } },
    },
    async (request) => {
      // Idempotent: removing a non-favorite is a no-op success.
      await db
        .delete(favorites)
        .where(and(eq(favorites.userId, request.user!.id), eq(favorites.gameId, request.params.gameId)));
      return { ok: true, favorited: false };
    },
  );
}
