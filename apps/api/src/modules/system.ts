import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
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
              signature: latest.signature,
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

  /**
   * Tauri updater feed. The desktop app polls
   * `/updates/{target}/{arch}/{currentVersion}` (see tauri.conf.json) and
   * expects either 204 (already current) or the JSON body below. The
   * `signature` is the detached minisign signature produced at build time —
   * the client verifies it against the pubkey baked into the binary, so an
   * unsigned row is unusable and is treated as "no update".
   */
  typed.get(
    '/updates/:target/:arch/:currentVersion',
    {
      schema: {
        params: z.object({
          target: z.string().max(40),
          arch: z.string().max(20),
          currentVersion: z.string().max(50),
        }),
      },
    },
    async (request, reply) => {
      const { target, currentVersion } = request.params;
      // Tauri's {{target}} is the OS ("windows"/"darwin"/"linux").
      const platform = target === 'darwin' ? 'macos' : target;

      // `isLatest` is the highest semver per platform+channel, reconciled on
      // every release mutation. Ordering by releasedAt instead would disagree
      // with it whenever releases are published out of semver order — e.g.
      // re-creating a 0.4.0 row after 0.5.0 exists would push 0.4.0 to every
      // user still on 0.3.x while the system itself considers 0.5.0 latest.
      const latest = await db.query.appVersions.findFirst({
        where: and(
          eq(appVersions.platform, platform),
          eq(appVersions.channel, 'stable'),
          eq(appVersions.isLatest, true),
        ),
      });

      // No release, unsigned release, or the client is already up to date.
      if (!latest || !latest.signature || compareSemver(latest.version, currentVersion) <= 0) {
        return reply.status(204).send();
      }

      return reply.status(200).send({
        version: latest.version,
        notes: latest.releaseNotes ?? '',
        pub_date: latest.releasedAt.toISOString(),
        url: latest.downloadUrl,
        signature: latest.signature,
      });
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
        appName: 'PC MAX',
        apiVersion: 'v1',
        contentUpdatedAt: contentUpdatedAt[0]?.m ?? null,
      };
    },
  );
}
