import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ProfileListResponse, OptimizationProfile } from '@goh/validation';
import { slugParams, slugProfileParams } from '../lib/params';
import { db } from '../db';
import { optimizationProfiles } from '../db/schema';
import { notFound } from '../lib/errors';
import { findPublishedGameBySlug } from '../services/games';
import { attachSettings, findPublishedProfile } from '../services/profiles';

export async function publicOptimizationsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/games/:slug/optimizations',
    {
      schema: {
        params: slugParams,
        response: { 200: ProfileListResponse },
      },
    },
    async (request) => {
      const game = await findPublishedGameBySlug(request.params.slug);
      const rows = await db
        .select()
        .from(optimizationProfiles)
        .where(
          and(
            eq(optimizationProfiles.gameId, game.id),
            eq(optimizationProfiles.status, 'published'),
            isNull(optimizationProfiles.deletedAt),
          ),
        )
        .orderBy(optimizationProfiles.isDefault);
      return { data: await attachSettings(rows) };
    },
  );

  typed.get(
    '/games/:slug/optimizations/:profileSlug',
    {
      schema: {
        params: slugProfileParams,
        response: { 200: OptimizationProfile },
      },
    },
    async (request) => {
      const game = await findPublishedGameBySlug(request.params.slug);
      const profile = await findPublishedProfile(request.params.profileSlug, game.id);
      if (!profile) throw notFound('Optimization profile');
      const [out] = await attachSettings([profile]);
      return out!;
    },
  );
}
