import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  OptimizationProfile,
  OptionCreateInput,
  OptionUpdateInput,
  ProfileCreateInput,
  ProfileUpdateInput,
  ProfileVersion,
  SettingCreateInput,
  SettingUpdateInput,
  VersionCreateInput,
} from '@goh/validation';
import { db } from '../db';
import {
  admins,
  optimizationCategories,
  optimizationOptions,
  optimizationProfileVersions,
  optimizationProfiles,
  optimizationSettings,
} from '../db/schema';
import { gameIdParams, idParams } from '../lib/params';
import { okSchema, dataListSchema, anyObjectSchema } from '../lib/schemas';
import { conflict, notFound } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { requirePermission } from '../lib/auth-middleware';
import { bumpPatch } from '../lib/semver';
import { findGameById } from '../services/games';
import { attachSettings, snapshotProfileData } from '../services/profiles';

type ProfileRow = typeof optimizationProfiles.$inferSelect;

async function findProfile(id: string): Promise<ProfileRow> {
  const row = await db.query.optimizationProfiles.findFirst({
    where: and(eq(optimizationProfiles.id, id), isNull(optimizationProfiles.deletedAt)),
  });
  if (!row) throw notFound('Optimization profile');
  return row;
}

function scrubProfile(p: ProfileRow) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    version: p.version,
    status: p.status,
    targetFps: p.targetFps,
    hardwareTier: p.hardwareTier,
  };
}

async function ensureProfileSlug(gameId: string, slug: string, excludeId?: string) {
  const existing = await db.query.optimizationProfiles.findFirst({
    where: and(
      eq(optimizationProfiles.gameId, gameId),
      eq(optimizationProfiles.slug, slug),
      excludeId ? ne(optimizationProfiles.id, excludeId) : undefined,
    ),
  });
  if (existing) throw conflict(`A profile with slug "${slug}" already exists for this game`);
}

export async function adminOptimizationsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---------------------------------------------------------------- profiles
  typed.get(
    '/admin/games/:gameId/profiles',
    {
      preHandler: [requirePermission('optimizations.read')],
      schema: {
        params: gameIdParams,
        response: { 200: dataListSchema },
      },
    },
    async (request) => {
      await findGameById(request.params.gameId);
      const rows = await db
        .select()
        .from(optimizationProfiles)
        .where(and(eq(optimizationProfiles.gameId, request.params.gameId), isNull(optimizationProfiles.deletedAt)))
        .orderBy(asc(optimizationProfiles.createdAt));
      return { data: await attachSettings(rows) };
    },
  );

  typed.post(
    '/admin/games/:gameId/profiles',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: gameIdParams,
        body: ProfileCreateInput,
        response: { 201: OptimizationProfile },
      },
    },
    async (request, reply) => {
      const game = await findGameById(request.params.gameId);
      const input = request.body;
      await ensureProfileSlug(game.id, input.slug);

      const inserted = await db
        .insert(optimizationProfiles)
        .values({
          gameId: game.id,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          targetFps: input.targetFps ?? null,
          hardwareTier: input.hardwareTier,
          version: input.version,
          colorProfile: input.colorProfile ?? null,
          isDefault: input.isDefault,
          status: 'draft',
        })
        .returning();
      const profile = inserted[0]!;

      if (input.isDefault) {
        await db
          .update(optimizationProfiles)
          .set({ isDefault: false })
          .where(and(eq(optimizationProfiles.gameId, game.id), ne(optimizationProfiles.id, profile.id)));
      }

      await recordAudit(request, {
        action: 'profile.create',
        entityType: 'optimization_profile',
        entityId: profile.id,
        after: scrubProfile(profile),
      });
      void reply.code(201);
      const [out] = await attachSettings([profile]);
      return out!;
    },
  );

  typed.get(
    '/admin/profiles/:id',
    {
      preHandler: [requirePermission('optimizations.read')],
      schema: {
        params: idParams,
        response: { 200: OptimizationProfile },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      const [out] = await attachSettings([profile]);
      return out!;
    },
  );

  typed.patch(
    '/admin/profiles/:id',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: idParams,
        body: ProfileUpdateInput,
        response: { 200: OptimizationProfile },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      const input = request.body;
      if (input.slug && input.slug !== profile.slug) await ensureProfileSlug(profile.gameId, input.slug, profile.id);

      const patch: Record<string, unknown> = {};
      for (const key of ['slug', 'name', 'description', 'targetFps', 'hardwareTier', 'version', 'isDefault', 'colorProfile'] as const) {
        if (input[key] !== undefined) patch[key] = input[key];
      }

      const before = scrubProfile(profile);
      const updated = await db
        .update(optimizationProfiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(optimizationProfiles.id, profile.id))
        .returning();
      const updatedProfile = updated[0]!;

      if (input.isDefault === true) {
        await db
          .update(optimizationProfiles)
          .set({ isDefault: false })
          .where(and(eq(optimizationProfiles.gameId, profile.gameId), ne(optimizationProfiles.id, profile.id)));
      }

      await recordAudit(request, {
        action: 'profile.update',
        entityType: 'optimization_profile',
        entityId: profile.id,
        before,
        after: scrubProfile(updatedProfile),
      });
      const [out] = await attachSettings([updatedProfile]);
      return out!;
    },
  );

  typed.delete(
    '/admin/profiles/:id',
    {
      preHandler: [requirePermission('optimizations.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      await db
        .update(optimizationProfiles)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(optimizationProfiles.id, profile.id));
      await recordAudit(request, {
        action: 'profile.delete',
        entityType: 'optimization_profile',
        entityId: profile.id,
        before: scrubProfile(profile),
      });
      return { ok: true };
    },
  );

  typed.post(
    '/admin/profiles/:id/publish',
    {
      preHandler: [requirePermission('optimizations.publish')],
      schema: {
        params: idParams,
        body: z.object({ status: z.enum(['published', 'draft', 'archived']) }),
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      const status = request.body.status as 'published' | 'draft' | 'archived';
      const publishedAt = status === 'published' ? (profile.publishedAt ?? new Date()) : profile.publishedAt;

      await db
        .update(optimizationProfiles)
        .set({ status, publishedAt, updatedAt: new Date() })
        .where(eq(optimizationProfiles.id, profile.id));
      await recordAudit(request, {
        action: 'profile.publish',
        entityType: 'optimization_profile',
        entityId: profile.id,
        before: { status: profile.status },
        after: { status },
      });
      return { ok: true };
    },
  );

  typed.post(
    '/admin/profiles/:id/versions',
    {
      preHandler: [requirePermission('optimizations.publish')],
      schema: {
        params: idParams,
        body: VersionCreateInput,
        response: { 200: z.object({ ok: z.boolean(), version: z.string() }) },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      const { version, changeNote } = request.body;
      const nextVersion = version ?? bumpPatch(profile.version);

      const snapshot = await snapshotProfileData(profile.id);
      await db.insert(optimizationProfileVersions).values({
        profileId: profile.id,
        version: nextVersion,
        changeNote: changeNote ?? null,
        data: snapshot ?? [],
        createdBy: request.admin!.id,
      });

      await db
        .update(optimizationProfiles)
        .set({ version: nextVersion, updatedAt: new Date() })
        .where(eq(optimizationProfiles.id, profile.id));
      await recordAudit(request, {
        action: 'profile.version',
        entityType: 'optimization_profile',
        entityId: profile.id,
        before: { version: profile.version },
        after: { version: nextVersion, changeNote: changeNote ?? null },
      });
      return { ok: true, version: nextVersion };
    },
  );

  typed.get(
    '/admin/profiles/:id/versions',
    {
      preHandler: [requirePermission('optimizations.read')],
      schema: {
        params: idParams,
        response: { 200: dataListSchema },
      },
    },
    async (request) => {
      const profile = await findProfile(request.params.id);
      const rows = await db
        .select({
          id: optimizationProfileVersions.id,
          version: optimizationProfileVersions.version,
          changeNote: optimizationProfileVersions.changeNote,
          createdAt: optimizationProfileVersions.createdAt,
          adminId: optimizationProfileVersions.createdBy,
        })
        .from(optimizationProfileVersions)
        .where(eq(optimizationProfileVersions.profileId, profile.id))
        .orderBy(desc(optimizationProfileVersions.createdAt));

      const adminIds = [...new Set(rows.map((r) => r.adminId).filter((v): v is string => Boolean(v)))];
      const adminRows = adminIds.length
        ? await db.select({ id: admins.id, email: admins.email }).from(admins).where(inArray(admins.id, adminIds))
        : [];
      const adminById = new Map(adminRows.map((a) => [a.id, a.email]));

      const out: ProfileVersion[] = rows.map((r) => ({
        id: r.id,
        version: r.version,
        changeNote: r.changeNote,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.adminId
          ? { id: r.adminId, email: adminById.get(r.adminId) ?? 'unknown' }
          : null,
      }));
      return { data: out };
    },
  );

  // ---------------------------------------------------------------- settings
  typed.post(
    '/admin/profiles/:id/settings',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: idParams,
        body: SettingCreateInput,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const profile = await findProfile(request.params.id);
      const input = request.body;
      const categoryId = input.categorySlug
        ? (await db.query.optimizationCategories.findFirst({ where: eq(optimizationCategories.slug, input.categorySlug) }))?.id ?? null
        : null;

      const inserted = await db
        .insert(optimizationSettings)
        .values({
          profileId: profile.id,
          categoryId,
          key: input.key,
          name: input.name,
          type: input.type,
          value: input.value,
          description: input.description ?? null,
          sortOrder: input.sortOrder,
        })
        .returning();
      const setting = inserted[0]!;
      await db.update(optimizationProfiles).set({ updatedAt: new Date() }).where(eq(optimizationProfiles.id, profile.id));
      await recordAudit(request, {
        action: 'setting.create',
        entityType: 'optimization_setting',
        entityId: setting.id,
        after: { key: setting.key, name: setting.name },
      });
      void reply.code(201);
      return { id: setting.id };
    },
  );

  typed.patch(
    '/admin/settings/:id',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: idParams,
        body: SettingUpdateInput,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const setting = await db.query.optimizationSettings.findFirst({ where: eq(optimizationSettings.id, request.params.id) });
      if (!setting) throw notFound('Setting');
      const input = request.body;

      const patch: Record<string, unknown> = {};
      for (const key of ['key', 'name', 'type', 'value', 'description', 'sortOrder'] as const) {
        if (input[key] !== undefined) patch[key] = input[key];
      }
      if (input.categorySlug !== undefined) {
        patch.categoryId =
          input.categorySlug === null
            ? null
            : (await db.query.optimizationCategories.findFirst({ where: eq(optimizationCategories.slug, input.categorySlug) }))?.id ?? null;
      }

      await db
        .update(optimizationSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(optimizationSettings.id, setting.id));
      await db.update(optimizationProfiles).set({ updatedAt: new Date() }).where(eq(optimizationProfiles.id, setting.profileId));
      await recordAudit(request, {
        action: 'setting.update',
        entityType: 'optimization_setting',
        entityId: setting.id,
        before: { key: setting.key },
        after: { key: patch.key ?? setting.key },
      });
      return { ok: true };
    },
  );

  typed.delete(
    '/admin/settings/:id',
    {
      preHandler: [requirePermission('optimizations.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const setting = await db.query.optimizationSettings.findFirst({ where: eq(optimizationSettings.id, request.params.id) });
      if (!setting) throw notFound('Setting');
      await db.delete(optimizationSettings).where(eq(optimizationSettings.id, setting.id));
      await db.update(optimizationProfiles).set({ updatedAt: new Date() }).where(eq(optimizationProfiles.id, setting.profileId));
      await recordAudit(request, {
        action: 'setting.delete',
        entityType: 'optimization_setting',
        entityId: setting.id,
        before: { key: setting.key },
      });
      return { ok: true };
    },
  );

  // ----------------------------------------------------------------- options
  typed.post(
    '/admin/settings/:id/options',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: idParams,
        body: OptionCreateInput,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, reply) => {
      const setting = await db.query.optimizationSettings.findFirst({ where: eq(optimizationSettings.id, request.params.id) });
      if (!setting) throw notFound('Setting');
      const inserted = await db
        .insert(optimizationOptions)
        .values({ settingId: setting.id, ...request.body })
        .onConflictDoNothing()
        .returning();
      const option = inserted[0];
      if (!option) throw conflict('An option with this value already exists');
      await db.update(optimizationProfiles).set({ updatedAt: new Date() }).where(eq(optimizationProfiles.id, setting.profileId));
      await recordAudit(request, {
        action: 'option.create',
        entityType: 'optimization_option',
        entityId: option.id,
        after: { value: option.value },
      });
      void reply.code(201);
      return { id: option.id };
    },
  );

  typed.patch(
    '/admin/options/:id',
    {
      preHandler: [requirePermission('optimizations.write')],
      schema: {
        params: idParams,
        body: OptionUpdateInput,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const option = await db.query.optimizationOptions.findFirst({ where: eq(optimizationOptions.id, request.params.id) });
      if (!option) throw notFound('Option');
      await db.update(optimizationOptions).set({ ...request.body }).where(eq(optimizationOptions.id, option.id));
      await recordAudit(request, {
        action: 'option.update',
        entityType: 'optimization_option',
        entityId: option.id,
        before: { value: option.value },
        after: { value: request.body.value ?? option.value },
      });
      return { ok: true };
    },
  );

  typed.delete(
    '/admin/options/:id',
    {
      preHandler: [requirePermission('optimizations.delete')],
      schema: {
        params: idParams,
        response: { 200: okSchema },
      },
    },
    async (request) => {
      const option = await db.query.optimizationOptions.findFirst({ where: eq(optimizationOptions.id, request.params.id) });
      if (!option) throw notFound('Option');
      await db.delete(optimizationOptions).where(eq(optimizationOptions.id, option.id));
      await recordAudit(request, {
        action: 'option.delete',
        entityType: 'optimization_option',
        entityId: option.id,
        before: { value: option.value },
      });
      return { ok: true };
    },
  );
}
