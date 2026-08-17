import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DeviceRegisterInput, DeviceRegisterResponse, ViewEventInput } from '@goh/validation';
import { db } from '../db';
import { games, optimizationProfiles, users, views } from '../db/schema';
import { badRequest } from '../lib/errors';
import { okSchema } from '../lib/schemas';

export async function deviceModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/users/device',
    {
      schema: {
        body: DeviceRegisterInput,
        response: { 200: DeviceRegisterResponse },
      },
    },
    async (request) => {
      const { deviceId, platform, appVersion } = request.body;
      const existing = await db.query.users.findFirst({ where: eq(users.deviceId, deviceId) });
      if (existing) {
        await db.update(users).set({ lastSeenAt: new Date(), platform }).where(eq(users.id, existing.id));
        return {
          userId: existing.id,
          deviceId: existing.deviceId,
          createdAt: existing.createdAt.toISOString(),
        };
      }
      const inserted = await db
        .insert(users)
        .values({ deviceId, platform, appVersion, lastSeenAt: new Date() })
        .returning();
      const row = inserted[0]!;
      return { userId: row.id, deviceId: row.deviceId, createdAt: row.createdAt.toISOString() };
    },
  );

  typed.post(
    '/views',
    {
      schema: {
        body: ViewEventInput,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const { deviceId, gameId, profileId } = request.body;
      if (!gameId && !profileId) throw badRequest('Provide at least one of gameId or profileId');

      let userId: string | null = null;
      if (deviceId) {
        const user = await db.query.users.findFirst({ where: eq(users.deviceId, deviceId) });
        userId = user?.id ?? null;
      }

      if (gameId) {
        const game = await db.query.games.findFirst({
          where: and(eq(games.id, gameId), isNull(games.deletedAt)),
        });
        if (game) {
          await db.insert(views).values({ userId, gameId });
          await db.update(games).set({ viewCount: sql`${games.viewCount} + 1` }).where(eq(games.id, gameId));
        }
      }

      if (profileId) {
        const profile = await db.query.optimizationProfiles.findFirst({
          where: and(eq(optimizationProfiles.id, profileId), isNull(optimizationProfiles.deletedAt)),
        });
        if (profile) {
          await db.insert(views).values({ userId, profileId });
          await db
            .update(optimizationProfiles)
            .set({ viewCount: sql`${optimizationProfiles.viewCount} + 1` })
            .where(eq(optimizationProfiles.id, profileId));
        }
      }

      return { ok: true };
    },
  );
}
