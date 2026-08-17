import { count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PaymentVerifyResponse } from '@goh/validation';
import { db } from '../db';
import { payments, subscriptionPlans, users } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { getPaymentProvider } from '../lib/payments/provider';
import { activatePayment } from '../services/subscriptions';
import { requirePermission } from '../lib/auth-middleware';
import { recordAudit } from '../lib/audit';
import { captureMessage } from '../lib/monitoring';

const VerifySchema = PaymentVerifyResponse;

/**
 * Server-side payment verification + activation.
 *
 * NEVER activates based on the client or the bare callback payload — the
 * payment is re-verified with the provider before the subscription changes.
 * Idempotent: repeated callbacks for an already-paid payment are harmless.
 */
async function verifyAndActivate(paymentId: string): Promise<(typeof VerifySchema)['_type']> {
  const payment = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!payment) throw notFound('Payment');

  const provider = getPaymentProvider(payment.provider);
  const result = await provider.verifyPayment({
    providerRef: payment.providerRef ?? '',
    amount: payment.amount,
    currency: payment.currency,
  });

  if (!result.verified) {
    await db
      .update(payments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    captureMessage('Payment verification failed', {
      paymentId: payment.id,
      provider: payment.provider,
      amount: payment.amount,
      currency: payment.currency,
    });
    return { ok: false, paymentId: payment.id, subscriptionId: null, message: 'Payment verification failed' };
  }

  if (result.providerTxId) {
    await db.update(payments).set({ providerTxId: result.providerTxId }).where(eq(payments.id, payment.id));
  }

  const subscription = await activatePayment(payment.id);
  return {
    ok: true,
    paymentId: payment.id,
    subscriptionId: subscription.id,
    message: 'Payment verified and subscription activated',
  };
}

/** Find the payment by explicit id, or by the provider authority reference. */
async function resolvePayment(paymentId: string | undefined, authority: string | undefined) {
  if (paymentId) return db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (authority) return db.query.payments.findFirst({ where: eq(payments.providerRef, authority) });
  throw badRequest('Missing paymentId or authority');
}

export async function paymentsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Provider redirect target (browser/desktop webview lands here after payment).
  typed.get(
    '/payments/:provider/callback',
    {
      schema: {
        params: z.object({ provider: z.enum(['mock', 'zarinpal']) }),
        querystring: z.object({
          authority: z.string().optional(),
          paymentId: z.string().uuid().optional(),
          status: z.string().optional(),
        }),
        response: { 200: VerifySchema },
      },
    },
    async (request) => {
      const payment = await resolvePayment(request.query.paymentId, request.query.authority);
      if (!payment) throw notFound('Payment');
      return verifyAndActivate(payment.id);
    },
  );

  // Same flow as JSON (used by tests and programmatic clients).
  typed.post(
    '/payments/:provider/callback',
    {
      schema: {
        params: z.object({ provider: z.enum(['mock', 'zarinpal']) }),
        body: z.object({
          authority: z.string().optional(),
          paymentId: z.string().uuid().optional(),
          status: z.string().optional(),
        }),
        response: { 200: VerifySchema },
      },
    },
    async (request) => {
      const payment = await resolvePayment(request.body.paymentId, request.body.authority);
      if (!payment) throw notFound('Payment');
      return verifyAndActivate(payment.id);
    },
  );

  // ----------------------------------------------------------- admin
  typed.get(
    '/admin/payments',
    {
      preHandler: [requirePermission('payments.read')],
      schema: {
        querystring: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }),
      },
    },
    async (request) => {
      const { page, limit } = request.query;
      const offset = (page - 1) * limit;

      const totalRows = await db
        .select({ value: count() })
        .from(payments)
        .where(isNull(payments.refundedAt));
      const total = totalRows[0]?.value ?? 0;

      const rows = await db
        .select({
          id: payments.id,
          amount: payments.amount,
          currency: payments.currency,
          provider: payments.provider,
          status: payments.status,
          providerRef: payments.providerRef,
          createdAt: payments.createdAt,
          userEmail: users.phone,
          planName: subscriptionPlans.name,
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .innerJoin(subscriptionPlans, eq(payments.planId, subscriptionPlans.id))
        .where(isNull(payments.refundedAt))
        .orderBy(desc(payments.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        data: rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          provider: r.provider,
          status: r.status,
          providerRef: r.providerRef,
          createdAt: r.createdAt.toISOString(),
          userEmail: r.userEmail,
          planName: r.planName,
        })),
        meta: { page, limit, total },
      };
    },
  );

  // Admin: manual subscription grant for a user (support flow).
  typed.post(
    '/admin/payments/manual-grant',
    {
      preHandler: [requirePermission('subscriptions.write')],
      schema: {
        body: z.object({ userId: z.string().uuid(), planId: z.string().uuid(), durationDays: z.number().int().min(1).max(3650).optional() }),
      },
    },
    async (request) => {
      const { userId, planId, durationDays } = request.body;
      const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!target) throw notFound('User');

      const { grantManualSubscription } = await import('../services/subscriptions');
      const subscription = await grantManualSubscription(userId, planId, durationDays);
      await recordAudit(request, {
        action: 'subscription.manual_grant',
        entityType: 'subscription',
        entityId: subscription.id,
        after: { userId, planId, durationDays: durationDays ?? null },
      });
      return { ok: true, subscriptionId: subscription.id };
    },
  );
}
