import { desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../db';
import { loginAttempts, users } from '../db/schema';
import { requirePermission } from '../lib/auth-middleware';

export async function adminSecurityModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Recent login attempts (failed = lockout candidates, success = session log).
  typed.get(
    '/admin/security/login-attempts',
    {
      preHandler: [requirePermission('settings.read')],
      schema: {
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), email: z.string().trim().max(200).optional() }),
      },
    },
    async (request) => {
      const { limit, email } = request.query;
      const rows = await db
        .select({
          id: loginAttempts.id,
          email: loginAttempts.email,
          ip: loginAttempts.ip,
          success: loginAttempts.success,
          attemptedAt: loginAttempts.attemptedAt,
          accountExists: users.id,
        })
        .from(loginAttempts)
        .leftJoin(users, or(eq(users.email, loginAttempts.email), eq(users.phone, loginAttempts.email)))
        .where(email ? eq(loginAttempts.email, email.toLowerCase()) : undefined)
        .orderBy(desc(loginAttempts.attemptedAt))
        .limit(limit);

      return {
        data: rows.map((r) => ({
          id: r.id,
          email: r.email,
          ip: r.ip,
          success: r.success,
          accountExists: Boolean(r.accountExists),
          attemptedAt: r.attemptedAt.toISOString(),
        })),
      };
    },
  );
}
