import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppVersionCreateInput, AppVersionUpdateInput } from '@goh/validation';
import { db } from '../db';
import { appVersions } from '../db/schema';
import { notFound } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { requirePermission } from '../lib/auth-middleware';
import { idParams } from '../lib/params';
import { anyObjectSchema, dataListSchema, okSchema } from '../lib/schemas';
import { compareSemver } from '../lib/semver';

export async function adminReleasesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/app-versions',
    {
      preHandler: [requirePermission('releases.read')],
      schema: { response: { 200: dataListSchema } },
    },
    async () => ({
      data: await db.select().from(appVersions).orderBy(desc(appVersions.releasedAt)),
    }),
  );

  typed.post(
    '/admin/app-versions',
    {
      preHandler: [requirePermission('releases.write')],
      schema: { body: AppVersionCreateInput, response: { 201: anyObjectSchema } },
    },
    async (request, reply) => {
      const [row] = await db.insert(appVersions).values(request.body).returning();
      await reconcileLatest();
      await recordAudit(request, { action: 'release.create', entityType: 'app_version', entityId: row!.id, after: request.body });
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/app-versions/:id',
    {
      preHandler: [requirePermission('releases.write')],
      schema: {
        params: idParams,
        body: AppVersionUpdateInput,
        response: { 200: anyObjectSchema },
      },
    },
    async (request) => {
      const existing = await db.query.appVersions.findFirst({ where: eq(appVersions.id, request.params.id) });
      if (!existing) throw notFound('App version');
      const [row] = await db
        .update(appVersions)
        .set({ ...request.body, updatedAt: new Date() })
        .where(eq(appVersions.id, existing.id))
        .returning();
      await recordAudit(request, { action: 'release.update', entityType: 'app_version', entityId: existing.id, after: request.body });
      return row;
    },
  );

  typed.delete(
    '/admin/app-versions/:id',
    {
      preHandler: [requirePermission('releases.write')],
      schema: { params: idParams, response: { 200: okSchema } },
    },
    async (request) => {
      const existing = await db.query.appVersions.findFirst({ where: eq(appVersions.id, request.params.id) });
      if (!existing) throw notFound('App version');
      await db.delete(appVersions).where(eq(appVersions.id, existing.id));
      await recordAudit(request, { action: 'release.delete', entityType: 'app_version', entityId: existing.id, before: { version: existing.version } });
      return { ok: true };
    },
  );

  typed.patch(
    '/admin/app-versions/:id/state',
    {
      preHandler: [requirePermission('releases.write')],
      schema: { params: idParams, response: { 200: okSchema } },
    },
    async () => {
      await reconcileLatest();
      return { ok: true };
    },
  );

  /** Keep `isLatest` consistent per platform+channel (highest semver wins). */
  async function reconcileLatest() {
    const all = await db.select().from(appVersions).orderBy(asc(appVersions.releasedAt));
    const latest = new Map<string, string>();
    for (const v of all) {
      const key = `${v.platform}:${v.channel}`;
      const cur = latest.get(key);
      if (!cur || compareSemver(v.version, cur) > 0) latest.set(key, v.version);
    }
    for (const v of all) {
      const shouldBe = latest.get(`${v.platform}:${v.channel}`) === v.version;
      if (v.isLatest !== shouldBe) {
        await db.update(appVersions).set({ isLatest: shouldBe }).where(eq(appVersions.id, v.id));
      }
    }
  }
}
