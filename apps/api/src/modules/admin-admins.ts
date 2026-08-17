import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AdminCreateInput, AdminUpdateInput } from '@goh/validation';
import { db } from '../db';
import { admins } from '../db/schema';
import { conflict, forbidden, notFound } from '../lib/errors';
import { anyObjectSchema } from '../lib/schemas';
import { recordAudit } from '../lib/audit';
import { requirePermission } from '../lib/auth-middleware';
import { hashPassword } from '../lib/password';

const PUBLIC_COLUMNS = {
  id: admins.id,
  email: admins.email,
  name: admins.name,
  role: admins.role,
  isActive: admins.isActive,
  lastLoginAt: admins.lastLoginAt,
  createdAt: admins.createdAt,
} as const;

export async function adminUsersModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/admin/admins',
    { preHandler: [requirePermission('admins.manage')] },
    async () => ({
      data: await db.select(PUBLIC_COLUMNS).from(admins).orderBy(asc(admins.createdAt)),
    }),
  );

  typed.post(
    '/admin/admins',
    {
      preHandler: [requirePermission('admins.manage')],
      schema: { body: AdminCreateInput, response: { 201: anyObjectSchema } },
    },
    async (request, reply) => {
      const { email, name, password, role } = request.body;
      const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) });
      if (existing) throw conflict('An admin with this email already exists');

      const [row] = await db
        .insert(admins)
        .values({ email, name, passwordHash: await hashPassword(password), role })
        .returning(PUBLIC_COLUMNS);
      await recordAudit(request, { action: 'admin.create', entityType: 'admin', entityId: row!.id, after: { email, role } });
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/admins/:id',
    {
      preHandler: [requirePermission('admins.manage')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: AdminUpdateInput,
      },
    },
    async (request) => {
      const target = await db.query.admins.findFirst({ where: eq(admins.id, request.params.id) });
      if (!target) throw notFound('Admin');
      if (target.id === request.admin!.id && (request.body.role || request.body.isActive !== undefined)) {
        throw forbidden('You cannot change your own role or active status');
      }

      const patch: Record<string, unknown> = {};
      for (const key of ['name', 'role', 'isActive'] as const) {
        if (request.body[key] !== undefined) patch[key] = request.body[key];
      }
      if (request.body.password) patch.passwordHash = await hashPassword(request.body.password);

      const [row] = await db
        .update(admins)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(admins.id, target.id))
        .returning(PUBLIC_COLUMNS);
      await recordAudit(request, { action: 'admin.update', entityType: 'admin', entityId: target.id, after: { email: target.email, ...patch } });
      return row;
    },
  );

  typed.delete(
    '/admin/admins/:id',
    {
      preHandler: [requirePermission('admins.manage')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request) => {
      const target = await db.query.admins.findFirst({ where: eq(admins.id, request.params.id) });
      if (!target) throw notFound('Admin');
      if (target.id === request.admin!.id) throw forbidden('You cannot delete your own account');
      await db.delete(admins).where(eq(admins.id, target.id));
      await recordAudit(request, { action: 'admin.delete', entityType: 'admin', entityId: target.id, before: { email: target.email } });
      return { ok: true };
    },
  );
}


