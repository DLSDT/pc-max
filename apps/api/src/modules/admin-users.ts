import { and, asc, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AdminUserUpdateInput, UserStatus } from '@goh/validation';
import { db } from '../db';
import { devices, subscriptions, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';

const USER_COLUMNS = {
  id: users.id,
  phone: users.phone,
  phoneVerified: users.phoneVerified,
  email: users.email,
  username: users.username,
  role: users.role,
  status: users.status,
  deviceId: users.deviceId,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
} as const;

export async function adminUsersModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/users',
    {
      preHandler: [requirePermission('users.read')],
      schema: {
        querystring: z.object({
          q: z.string().trim().max(200).optional(),
          status: UserStatus.optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (request) => {
      const { q, status, page, limit } = request.query;
      const offset = (page - 1) * limit;

      const where = and(
        status ? eq(users.status, status) : undefined,
        q
          ? or(
              eq(users.phone, q),
              eq(users.email, q.toLowerCase()),
              eq(users.username, q),
              eq(users.deviceId, q),
              ilike(users.phone, `%${escapeLike(q)}%`),
              ilike(users.email, `%${escapeLike(q)}%`),
              ilike(users.username, `%${escapeLike(q)}%`),
            )
          : undefined,
      );

      const totalRows = await db.select({ value: count() }).from(users).where(where);
      const total = totalRows[0]?.value ?? 0;

      const rows = await db.select(USER_COLUMNS).from(users).where(where).orderBy(desc(users.createdAt), asc(users.id)).limit(limit).offset(offset);

      return {
        data: rows.map((u) => ({
          ...u,
          phone: u.phone ?? null,
          email: u.email ?? null,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          createdAt: u.createdAt.toISOString(),
        })),
        meta: { page, limit, total },
      };
    },
  );

  typed.get(
    '/admin/users/:id',
    {
      preHandler: [requirePermission('users.read')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
      if (!user) throw notFound('User');

      const userDevices = await db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)))
        .orderBy(asc(devices.createdAt));
      const userSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .orderBy(desc(subscriptions.createdAt));

      return {
        user: {
          id: user.id,
          phone: user.phone ?? null,
          phoneVerified: user.phoneVerified,
          email: user.email ?? null,
          username: user.username ?? null,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        },
        devices: userDevices.map((d) => ({
          id: d.id,
          deviceId: d.deviceId,
          name: d.name ?? null,
          platform: d.platform,
          lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
        })),
        subscriptions: userSubscriptions.map((s) => ({
          id: s.id,
          planId: s.planId,
          status: s.status,
          startDate: s.startDate.toISOString(),
          expirationDate: s.expirationDate.toISOString(),
          createdAt: s.createdAt.toISOString(),
        })),
      };
    },
  );

  typed.patch(
    '/admin/users/:id',
    {
      preHandler: [requirePermission('users.write')],
      schema: { params: z.object({ id: z.string().uuid() }), body: AdminUserUpdateInput },
    },
    async (request) => {
      const target = await db.query.users.findFirst({ where: eq(users.id, request.params.id) });
      if (!target) throw notFound('User');

      const patch: Record<string, unknown> = {};
      if (request.body.status) patch.status = request.body.status;
      if (request.body.username !== undefined) patch.username = request.body.username;
      patch.updatedAt = new Date();

      const [row] = await db.update(users).set(patch).where(eq(users.id, target.id)).returning(USER_COLUMNS);
      await recordAudit(request, {
        action: request.body.status === 'suspended' ? 'user.suspend' : 'user.update',
        entityType: 'user',
        entityId: target.id,
        before: { status: target.status },
        after: patch,
      });
      return {
        id: row!.id,
        phone: row!.phone ?? null,
        phoneVerified: row!.phoneVerified,
        email: row!.email ?? null,
        username: row!.username ?? null,
        role: row!.role,
        status: row!.status,
        createdAt: row!.createdAt.toISOString(),
      };
    },
  );
}

/** Escape LIKE wildcards so user input is never treated as a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
