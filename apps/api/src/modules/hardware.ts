import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HardwareProfileInput, HardwareProfilePublic, HardwareRecommendInput, HardwareRecommendResponse } from '@goh/validation';
import { db } from '../db';
import { games, hardwareProfiles, optimizationPackages } from '../db/schema';
import { authenticateUser } from '../lib/auth-middleware';
import { notFound } from '../lib/errors';
import { recommend } from '../services/compatibility';
import { toPackagePublic } from '../services/packages';

const HardwareProfileSchema = HardwareProfilePublic;

export async function hardwareModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Store the latest detected hardware snapshot (privacy-conscious fields only).
  typed.put(
    '/me/hardware',
    {
      preHandler: [authenticateUser],
      schema: { body: HardwareProfileInput, response: { 200: HardwareProfileSchema } },
    },
    async (request) => {
      const userId = request.user!.id;
      const body = request.body;
      const existing = await db.query.hardwareProfiles.findFirst({ where: eq(hardwareProfiles.userId, userId) });

      const values = {
        cpu: body.cpu ?? null,
        gpuVendor: body.gpuVendor ?? null,
        gpuModel: body.gpuModel ?? null,
        vramMb: body.vramMb ?? null,
        ramGb: body.ramGb ?? null,
        windowsVersion: body.windowsVersion ?? null,
        arch: body.arch ?? null,
        resolution: body.resolution ?? null,
        driverVersion: body.driverVersion ?? null,
        detectedAt: new Date(),
      };

      if (existing) {
        const [row] = await db
          .update(hardwareProfiles)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(hardwareProfiles.id, existing.id))
          .returning();
        return toProfile(row!);
      }
      const [row] = await db.insert(hardwareProfiles).values({ userId, ...values }).returning();
      return toProfile(row!);
    },
  );

  typed.get(
    '/me/hardware',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: HardwareProfileSchema } },
    },
    async (request) => {
      const row = await db.query.hardwareProfiles.findFirst({ where: eq(hardwareProfiles.userId, request.user!.id) });
      if (!row) throw notFound('Hardware profile');
      return toProfile(row);
    },
  );

  // Compatibility engine: best published package for a game + hardware.
  typed.post(
    '/hardware/recommend',
    {
      schema: { body: HardwareRecommendInput, response: { 200: HardwareRecommendResponse } },
    },
    async (request) => {
      const { gameSlug, hardware } = request.body;
      const game = await db.query.games.findFirst({
        where: and(eq(games.slug, gameSlug), eq(games.status, 'published'), isNull(games.deletedAt)),
      });
      if (!game) throw notFound('Game');

      const published = await db
        .select()
        .from(optimizationPackages)
        .where(and(eq(optimizationPackages.gameId, game.id), eq(optimizationPackages.status, 'published'), isNull(optimizationPackages.deletedAt)));

      const result = recommend(published, hardware);
      return {
        gameSlug,
        recommended: result.recommended ? toPackagePublic(result.recommended) : null,
        alternatives: result.scored.filter((s) => s.compatible).map((s) => toPackagePublic(s.pkg)),
        reasons: result.reasons,
      };
    },
  );
}

function toProfile(row: typeof hardwareProfiles.$inferSelect): HardwareProfilePublic {
  return {
    cpu: row.cpu ?? null,
    gpuVendor: (row.gpuVendor as HardwareProfilePublic['gpuVendor']) ?? null,
    gpuModel: row.gpuModel ?? null,
    vramMb: row.vramMb ?? null,
    ramGb: row.ramGb ?? null,
    windowsVersion: row.windowsVersion ?? null,
    arch: row.arch ?? null,
    resolution: row.resolution ?? null,
    driverVersion: row.driverVersion ?? null,
    detectedAt: row.detectedAt ? row.detectedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
