import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PurchaseInput, PurchaseResponse, SubscriptionPlanPublic } from '@goh/validation';
import { config } from '../config';
import { db } from '../db';
import { payments, subscriptionPlans } from '../db/schema';
import { authenticateUser } from '../lib/auth-middleware';
import { getPaymentProvider } from '../lib/payments/provider';
import { configCache } from '../lib/ttl-cache';
import { createPurchase } from '../services/subscriptions';

const PlanSchema = SubscriptionPlanPublic;

export async function subscriptionsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Public storefront — no auth needed to browse plans. Semi-static data,
  // so it is served from the config cache (Phase 16).
  typed.get(
    '/subscriptions/plans',
    {
      schema: { response: { 200: z.object({ data: z.array(PlanSchema) }) } },
    },
    async (_request, reply) => {
      const payload = await configCache.get('plans', async () => {
        const rows = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.status, 'active'))
          .orderBy(asc(subscriptionPlans.sortOrder));
        return {
          data: rows.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            durationDays: p.durationDays,
            price: p.price,
            currency: p.currency,
            deviceLimit: p.deviceLimit,
            features: p.features,
            sortOrder: p.sortOrder,
          })),
        };
      });
      void reply.header('cache-control', `public, max-age=${config.CONFIG_CACHE_TTL}`);
      return payload;
    },
  );

  // Begin a purchase: create payment + pending subscription, then ask the
  // configured provider for a payment URL. Idempotent via idempotencyKey.
  typed.post(
    '/subscriptions/purchase',
    {
      preHandler: [authenticateUser],
      schema: { body: PurchaseInput, response: { 200: PurchaseResponse } },
    },
    async (request) => {
      const { planId, idempotencyKey } = request.body;
      const provider = getPaymentProvider(config.PAYMENT_PROVIDER);
      const purchase = await createPurchase(request.user!.id, planId, idempotencyKey, provider.name);

      let redirectUrl: string | null = null;
      if (!purchase.existing) {
        const result = await provider.requestPayment({
          referenceId: purchase.paymentId,
          amount: purchase.plan.price,
          currency: purchase.plan.currency,
          description: `${purchase.plan.name} — Game Optimization Hub`,
          callbackUrl: `${config.ZARINPAL_CALLBACK_BASE_URL}/api/v1/payments/${provider.name}/callback`,
        });
        redirectUrl = result.redirectUrl;
        await db
          .update(payments)
          .set({ provider: provider.name, providerRef: result.providerRef })
          .where(eq(payments.id, purchase.paymentId));
      }

      return {
        paymentId: purchase.paymentId,
        subscriptionId: purchase.subscriptionId,
        provider: provider.name,
        redirectUrl,
        status: purchase.status,
      };
    },
  );
}
