import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db';
import { devices, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';

export async function adminDevicesModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/devices',
    {
      preHandler: [requirePermission('devices.read')],
      schema: {
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          q: z.string().trim().max(200).optional(),
        }),
      },
    },
    async (request) => {
      const { page, limit, q } = request.query;
      const offset = (page - 1) * limit;
      const where = and(isNull(devices.revokedAt), q ? eq(users.email, q.toLowerCase()) : undefined);

      const totalRows = await db
        .select({ value: count() })
        .from(devices)
        .innerJoin(users, eq(devices.userId, users.id))
        .where(where);
      const rows = await db
        .select({
          id: devices.id,
          deviceId: devices.deviceId,
          name: devices.name,
          platform: devices.platform,
          lastSeenAt: devices.lastSeenAt,
          createdAt: devices.createdAt,
          userEmail: users.phone,
        })
        .from(devices)
        .innerJoin(users, eq(devices.userId, users.id))
        .where(where)
        .orderBy(desc(devices.lastSeenAt), asc(devices.id))
        .limit(limit)
        .offset(offset);

      return {
        data: rows.map((r) => ({
          id: r.id,
          deviceId: r.deviceId,
          name: r.name,
          platform: r.platform,
          lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          userEmail: r.userEmail,
        })),
        meta: { page, limit, total: totalRows[0]?.value ?? 0 },
      };
    },
  );

  typed.post(
    '/admin/devices/:id/revoke',
    {
      preHandler: [requirePermission('devices.write')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const device = await db.query.devices.findFirst({ where: eq(devices.id, request.params.id) });
      if (!device) throw notFound('Device');
      await db.update(devices).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(devices.id, device.id));
      await recordAudit(request, { action: 'device.revoke', entityType: 'device', entityId: device.id, before: { deviceId: device.deviceId } });
      return { ok: true };
    },
  );
}
