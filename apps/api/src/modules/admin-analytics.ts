import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DashboardResponse } from '@goh/validation';
import { db } from '../db';
import { appVersions, gameImages, games, optimizationProfiles, users, views } from '../db/schema';
import { requirePermission } from '../lib/auth-middleware';
import { attachGameMetadata, iso, toSummary } from '../services/games';

export async function adminAnalyticsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/dashboard',
    {
      preHandler: [requirePermission('analytics.read')],
      schema: { response: { 200: DashboardResponse } },
    },
    async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const [totalUsers, activeUsers, totalGames, publishedGames, totalProfiles, totalViews, versionCount] =
        await Promise.all([
          db.select({ n: count() }).from(users),
          db.select({ n: count() }).from(users).where(gte(users.lastSeenAt, weekAgo)),
          db.select({ n: count() }).from(games).where(isNull(games.deletedAt)),
          db.select({ n: count() }).from(games).where(and(eq(games.status, 'published'), isNull(games.deletedAt))),
          db.select({ n: count() }).from(optimizationProfiles).where(isNull(optimizationProfiles.deletedAt)),
          db.select({ n: count() }).from(views),
          db.select({ n: count() }).from(appVersions),
        ]);

      const [topViews, dailyViews, recentRows, updatedRows] = await Promise.all([
        db
          .select({ gameId: views.gameId, n: sql<number>`count(*)::int` })
          .from(views)
          .where(and(sql`${views.gameId} is not null`, gte(views.viewedAt, twoWeeksAgo)))
          .groupBy(views.gameId)
          .orderBy(desc(sql`count(*)`))
          .limit(5),
        db
          .select({ date: sql<string>`to_char(${views.viewedAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
          .from(views)
          .where(gte(views.viewedAt, twoWeeksAgo))
          .groupBy(sql`to_char(${views.viewedAt}, 'YYYY-MM-DD')`)
          .orderBy(sql`to_char(${views.viewedAt}, 'YYYY-MM-DD')`),
        db
          .select()
          .from(games)
          .where(and(eq(games.status, 'published'), isNull(games.deletedAt)))
          .orderBy(desc(games.createdAt))
          .limit(5),
        db
          .select({ id: games.id, name: games.name, slug: games.slug, updatedAt: games.updatedAt })
          .from(games)
          .where(isNull(games.deletedAt))
          .orderBy(desc(games.updatedAt))
          .limit(5),
      ]);

      // Resolve top games -> names + covers.
      const topGameIds = topViews.map((r) => r.gameId).filter((v): v is string => Boolean(v));
      const viewsByGame = new Map(topViews.map((r) => [r.gameId, Number(r.n)]));
      let topGames: { gameId: string; slug: string; name: string; coverUrl: string | null; views: number }[] = [];

      if (topGameIds.length) {
        const gameRows = await db
          .select({ id: games.id, slug: games.slug, name: games.name })
          .from(games)
          .where(and(inArray(games.id, topGameIds), isNull(games.deletedAt)));
        const covers = await db
          .select({ gameId: gameImages.gameId, url: gameImages.url })
          .from(gameImages)
          .where(and(inArray(gameImages.gameId, topGameIds), eq(gameImages.type, 'cover')))
          .orderBy(gameImages.sortOrder);
        const coverByGame = new Map<string, string>();
        for (const c of covers) if (!coverByGame.has(c.gameId)) coverByGame.set(c.gameId, c.url);

        topGames = gameRows
          .map((g) => ({
            gameId: g.id,
            slug: g.slug,
            name: g.name,
            coverUrl: coverByGame.get(g.id) ?? null,
            views: viewsByGame.get(g.id) ?? 0,
          }))
          .sort((a, b) => b.views - a.views);
      }

      const recentEnriched = await attachGameMetadata(recentRows);

      return {
        stats: {
          totalUsers: Number(totalUsers[0]?.n ?? 0),
          activeUsers7d: Number(activeUsers[0]?.n ?? 0),
          totalGames: Number(totalGames[0]?.n ?? 0),
          publishedGames: Number(publishedGames[0]?.n ?? 0),
          totalProfiles: Number(totalProfiles[0]?.n ?? 0),
          totalViews: Number(totalViews[0]?.n ?? 0),
          appVersions: Number(versionCount[0]?.n ?? 0),
        },
        topGames,
        dailyViews: dailyViews.map((d) => ({ date: d.date, views: Number(d.n) })),
        recentGames: recentEnriched.map(toSummary),
        recentUpdates: updatedRows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, updatedAt: iso(r.updatedAt)! })),
      };
    },
  );
}
