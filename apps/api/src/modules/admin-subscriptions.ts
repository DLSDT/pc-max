import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AdminSubscriptionPatch,
  SubscriptionPlanInput,
  SubscriptionPlanUpdateInput,
  SubscriptionStatus,
} from '@goh/validation';
import { db } from '../db';
import { entitlements, subscriptionPlans, subscriptions, users } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';
import { configCache } from '../lib/ttl-cache';

export async function adminSubscriptionsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ------------------------------------------------------------ plans

  typed.get(
    '/admin/subscriptions/plans',
    { preHandler: [requirePermission('subscriptions.read')] },
    async () => {
      const rows = await db.select().from(subscriptionPlans).orderBy(desc(subscriptionPlans.sortOrder));
      return { data: rows };
    },
  );

  typed.post(
    '/admin/subscriptions/plans',
    {
      preHandler: [requirePermission('subscriptions.write')],
      schema: { body: SubscriptionPlanInput },
    },
    async (request, reply) => {
      const body = request.body;
      const existing = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.slug, body.slug) });
      if (existing) throw conflict('A plan with this slug already exists');

      const [row] = await db
        .insert(subscriptionPlans)
        .values({
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          durationDays: body.durationDays,
          price: body.price,
          currency: body.currency,
          deviceLimit: body.deviceLimit,
          features: body.features,
          status: body.status,
          sortOrder: body.sortOrder,
        })
        .returning();
      await recordAudit(request, { action: 'plan.create', entityType: 'subscription_plan', entityId: row!.id, after: body });
      await configCache.invalidate('plans');
      void reply.code(201);
      return row;
    },
  );

  typed.patch(
    '/admin/subscriptions/plans/:id',
    {
      preHandler: [requirePermission('subscriptions.write')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: SubscriptionPlanUpdateInput,
      },
    },
    async (request) => {
      const target = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, request.params.id) });
      if (!target) throw notFound('Subscription plan');

      const body = request.body;
      const patch: Record<string, unknown> = {};
      for (const key of ['name', 'slug', 'description', 'durationDays', 'price', 'currency', 'deviceLimit', 'features', 'status', 'sortOrder'] as const) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      patch.updatedAt = new Date();

      if (patch.slug && patch.slug !== target.slug) {
        const clash = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.slug, patch.slug as string) });
        if (clash) throw conflict('A plan with this slug already exists');
      }

      const [row] = await db.update(subscriptionPlans).set(patch).where(eq(subscriptionPlans.id, target.id)).returning();
      await configCache.invalidate('plans');
      await recordAudit(request, {
        action: 'plan.update',
        entityType: 'subscription_plan',
        entityId: target.id,
        before: { name: target.name, price: target.price, status: target.status },
        after: patch,
      });
      return row;
    },
  );

  typed.delete(
    '/admin/subscriptions/plans/:id',
    {
      preHandler: [requirePermission('subscriptions.write')],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const target = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, request.params.id) });
      if (!target) throw notFound('Subscription plan');
      // Soft-disable instead of hard delete — subscriptions reference the plan.
      await db.update(subscriptionPlans).set({ status: 'inactive', updatedAt: new Date() }).where(eq(subscriptionPlans.id, target.id));
      await configCache.invalidate('plans');
      await recordAudit(request, { action: 'plan.disable', entityType: 'subscription_plan', entityId: target.id, before: { status: target.status } });
      return { ok: true };
    },
  );

  // ------------------------------------------------------------ subscriptions

  typed.get(
    '/admin/subscriptions',
    {
      preHandler: [requirePermission('subscriptions.read')],
      schema: {
        querystring: z.object({
          status: SubscriptionStatus.optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (request) => {
      const { status, page, limit } = request.query;
      const offset = (page - 1) * limit;
      const where = status ? eq(subscriptions.status, status) : undefined;

      const totalRows = await db.select({ value: count() }).from(subscriptions).where(where);
      const rows = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          startDate: subscriptions.startDate,
          expirationDate: subscriptions.expirationDate,
          createdAt: subscriptions.createdAt,
          userEmail: users.phone,
          planName: subscriptionPlans.name,
          planDurationDays: subscriptionPlans.durationDays,
        })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(where)
        .orderBy(desc(subscriptions.createdAt), asc(subscriptions.id))
        .limit(limit)
        .offset(offset);

      return {
        data: rows.map((r) => ({
          id: r.id,
          status: r.status,
          startDate: r.startDate.toISOString(),
          expirationDate: r.expirationDate.toISOString(),
          createdAt: r.createdAt.toISOString(),
          userEmail: r.userEmail,
          planName: r.planName,
          planDurationDays: r.planDurationDays,
        })),
        meta: { page, limit, total: totalRows[0]?.value ?? 0 },
      };
    },
  );

  typed.patch(
    '/admin/subscriptions/:id',
    {
      preHandler: [requirePermission('subscriptions.write')],
      schema: { params: z.object({ id: z.string().uuid() }), body: AdminSubscriptionPatch },
    },
    async (request) => {
      const target = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, request.params.id) });
      if (!target) throw notFound('Subscription');

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (request.body.status) patch.status = request.body.status;
      if (request.body.extendDays) {
        const base = target.status === 'active' && target.expirationDate > new Date() ? target.expirationDate : new Date();
        patch.expirationDate = new Date(base.getTime() + request.body.extendDays * 24 * 60 * 60 * 1000);
        if (!request.body.status) patch.status = 'active';
      }

      const [row] = await db.update(subscriptions).set(patch).where(eq(subscriptions.id, target.id)).returning();

      // Keep the subscription's entitlement rows aligned with an extend:
      // pushing their expiry forward prevents a premature cutoff while the
      // subscription is still paid. Suspend/revoke needs no row surgery — the
      // entitlement join already requires subscription.status = 'active', so a
      // status change takes effect immediately and is reversible on re-activate.
      if (request.body.extendDays && row) {
        await db
          .update(entitlements)
          .set({ expiresAt: row.expirationDate })
          .where(and(eq(entitlements.subscriptionId, row.id), eq(entitlements.userId, target.userId)));
      }
      await recordAudit(request, {
        action: 'subscription.update',
        entityType: 'subscription',
        entityId: target.id,
        before: { status: target.status, expirationDate: target.expirationDate.toISOString() },
        after: patch,
      });
      return row;
    },
  );

}
