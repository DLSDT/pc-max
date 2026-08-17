import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppSettings, AppVersionCheckQuery, AppVersionCheckResponse } from '@goh/validation';
import { db } from '../db';
import { appVersions, categories, games, optimizationProfiles } from '../db/schema';
import { compareSemver } from '../lib/semver';

export async function systemModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  typed.get(
    '/app/version',
    {
      schema: {
        querystring: AppVersionCheckQuery,
        response: { 200: AppVersionCheckResponse },
      },
    },
    async (request) => {
      const { current, platform, channel } = request.query;
      const latest = await db.query.appVersions.findFirst({
        where: and(eq(appVersions.platform, platform), eq(appVersions.channel, channel)),
        orderBy: desc(appVersions.releasedAt),
      });

      const updateAvailable = Boolean(latest && current && compareSemver(latest.version, current) > 0);

      return {
        latest: latest
          ? {
              id: latest.id,
              version: latest.version,
              platform: latest.platform as 'windows',
              channel: latest.channel,
              releaseNotes: latest.releaseNotes,
              downloadUrl: latest.downloadUrl,
              checksumSha256: latest.checksumSha256,
              minAppVersion: latest.minAppVersion,
              isLatest: latest.isLatest,
              releasedAt: latest.releasedAt.toISOString(),
            }
          : null,
        updateAvailable,
        current: current ?? null,
      };
    },
  );

  typed.get(
    '/settings',
    {
      schema: { response: { 200: AppSettings } },
    },
    async () => {
      const contentUpdatedAt = await db
        .select({ m: sql<string>`max(greatest(${games.updatedAt}, ${optimizationProfiles.updatedAt}, ${categories.updatedAt}))` })
        .from(games)
        .limit(1);
      return {
        appName: 'Game Optimization Hub',
        apiVersion: 'v1',
        contentUpdatedAt: contentUpdatedAt[0]?.m ?? null,
      };
    },
  );
}
