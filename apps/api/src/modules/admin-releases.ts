import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppVersionCreateInput, AppVersionUpdateInput } from '@goh/validation';
import { db } from '../db';
import { appVersions } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
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
      // The body can change `version`, which moves which row is the highest
      // semver — leave isLatest stale and the updater feed points at the wrong
      // release.
      await reconcileLatest();
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
      // Deleting the current latest would otherwise leave no row flagged, and
      // the updater feed would serve 204 to everyone until someone touched a
      // release by hand.
      await reconcileLatest();
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
    // The admin panel's "mark latest" button sends the row's id here. This
    // used to ignore it and just re-run reconcileLatest(), which recomputes
    // "highest semver wins" — so the one case the button exists for, pinning
    // an OLDER build after a bad release, reported success and changed
    // nothing. Set the requested version instead.
    async (request) => {
      const target = await db.query.appVersions.findFirst({ where: eq(appVersions.id, request.params.id) });
      if (!target) throw notFound('App version');

      // The updater feed skips a release with no signature, so pinning one
      // would silently stop updates for every user on that platform.
      if (!target.signature) {
        throw badRequest('This build has no updater signature, so clients would never be offered it.');
      }

      await db
        .update(appVersions)
        .set({ isLatest: false, updatedAt: new Date() })
        .where(and(eq(appVersions.platform, target.platform), eq(appVersions.channel, target.channel)));
      await db.update(appVersions).set({ isLatest: true, updatedAt: new Date() }).where(eq(appVersions.id, target.id));

      await recordAudit(request, {
        action: 'release.set_latest',
        entityType: 'app_version',
        entityId: target.id,
        after: { version: target.version, platform: target.platform, channel: target.channel },
      });
      return { ok: true };
    },
  );

  /**
   * Keep `isLatest` consistent per platform+channel: the highest semver the
   * updater can actually serve.
   *
   * Signature matters here, not just version order. The feed returns 204 for a
   * release with no signature, so letting an unsigned build take the flag —
   * a CI run where signing failed, say — would silently stop updates for every
   * user on that platform with nothing to show why.
   */
  async function reconcileLatest() {
    const all = await db.select().from(appVersions).orderBy(asc(appVersions.releasedAt));
    const latest = new Map<string, string>();
    for (const v of all) {
      if (!v.signature) continue;
      const key = `${v.platform}:${v.channel}`;
      const cur = latest.get(key);
      if (!cur || compareSemver(v.version, cur) > 0) latest.set(key, v.version);
    }
    for (const v of all) {
      const shouldBe = Boolean(v.signature) && latest.get(`${v.platform}:${v.channel}`) === v.version;
      if (v.isLatest !== shouldBe) {
        await db.update(appVersions).set({ isLatest: shouldBe }).where(eq(appVersions.id, v.id));
      }
    }
  }
}
