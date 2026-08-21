import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { dataListSchema } from '../lib/schemas';
import { db } from '../db';
import { games, optimizationProfiles } from '../db/schema';
import { attachGameMetadata, publishedGameWhere, toSummary } from '../services/games';

/**
 * Optimized Setting — every published game that has at least one published,
 * Yellow/Green-tagged optimization profile. Shown unconditionally (not
 * gated on the user's own library), so this is a standalone public list.
 */
export async function publicOptimizedSettingModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/optimized-setting/games',
    {
      schema: { response: { 200: dataListSchema } },
    },
    async () => {
      const taggedGameIds = db
        .selectDistinct({ gameId: optimizationProfiles.gameId })
        .from(optimizationProfiles)
        .where(
          and(
            eq(optimizationProfiles.status, 'published'),
            isNull(optimizationProfiles.deletedAt),
            inArray(optimizationProfiles.colorProfile, ['yellow', 'green']),
          ),
        );

      // Neither this query nor the page sorts, so the order was whatever the
      // planner happened to produce — stable today, but free to change on a
      // plan or statistics change, which would silently reshuffle the list
      // between visits. Alphabetical is what a browsable page should be.
      const rows = await db
        .select()
        .from(games)
        .where(and(publishedGameWhere(), inArray(games.id, taggedGameIds)))
        .orderBy(asc(games.name), asc(games.id));

      const enriched = await attachGameMetadata(rows);
      return { data: enriched.map(toSummary) };
    },
  );
}
