import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuditLogListResponse } from '@goh/validation';
import { db } from '../db';
import { admins, auditLogs } from '../db/schema';
import { requirePermission } from '../lib/auth-middleware';
import { ok, paginationMeta } from '../lib/http';

export async function adminAuditModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/audit-logs',
    {
      preHandler: [requirePermission('audit.read')],
      schema: {
        querystring: z.object({
          entityType: z.string().trim().max(100).optional(),
          q: z.string().trim().max(100).optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
        response: { 200: AuditLogListResponse },
      },
    },
    async (request) => {
      const { entityType, q, page, limit } = request.query;

      const where = [
        entityType ? eq(auditLogs.entityType, entityType) : undefined,
        q ? ilike(auditLogs.action, `%${q}%`) : undefined,
      ].filter(Boolean) as ReturnType<typeof eq>[];

      const [total, rows] = await Promise.all([
        db.select({ n: count() }).from(auditLogs).where(and(...where)),
        db
          .select({
            id: auditLogs.id,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            before: auditLogs.before,
            after: auditLogs.after,
            ip: auditLogs.ip,
            createdAt: auditLogs.createdAt,
            adminId: auditLogs.adminId,
            adminEmail: admins.email,
            adminName: admins.name,
          })
          .from(auditLogs)
          .leftJoin(admins, eq(auditLogs.adminId, admins.id))
          .where(and(...where))
          .orderBy(desc(auditLogs.createdAt), asc(auditLogs.id))
          .limit(limit)
          .offset((page - 1) * limit),
      ]);

      return ok(
        rows.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          before: r.before,
          after: r.after,
          ip: r.ip,
          createdAt: r.createdAt.toISOString(),
          admin: r.adminId ? { id: r.adminId, email: r.adminEmail ?? '', name: r.adminName ?? '' } : null,
        })),
        paginationMeta(page, limit, Number(total[0]?.n ?? 0)),
      );
    },
  );
}


