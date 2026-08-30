import { asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
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
    // Our row id is what was sent as the gateway's order reference at request
    // time; IDPay verifies against both and refuses with only its own id.
    orderId: payment.id,
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

/**
 * Every name a gateway might use for "our payment id" and "your reference".
 *
 * Each gateway invented its own: ZarinPal sends `Authority`, Zibal sends
 * `trackId` plus our `orderId`, IDPay sends `id` plus our `order_id`. They all
 * mean one of two things, so they are normalised here rather than giving each
 * provider its own callback route — the verification that follows is identical.
 */
const OUR_ID_KEYS = ['paymentId', 'orderId', 'order_id'] as const;
const PROVIDER_REF_KEYS = ['authority', 'Authority', 'trackId', 'id'] as const;

function pick(params: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = params[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Find the payment by our own id, or by whatever reference the gateway sent. */
async function resolvePayment(params: Record<string, unknown>) {
  const ours = pick(params, OUR_ID_KEYS);
  // Our own id is a uuid; a gateway echoing something else back must not be
  // used to look up a row by primary key.
  if (ours && /^[0-9a-f-]{36}$/i.test(ours)) {
    const byId = await db.query.payments.findFirst({ where: eq(payments.id, ours) });
    if (byId) return byId;
  }
  const ref = pick(params, PROVIDER_REF_KEYS);
  if (ref) return db.query.payments.findFirst({ where: eq(payments.providerRef, ref) });
  if (!ours) throw badRequest('Missing payment reference');
  return undefined;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The page the browser passes through on its way to the gateway.
 *
 * Zibal rejects a payment whose navigation carries an empty `Referer`, and a
 * URL opened straight from the desktop shell has no referring page at all.
 * Serving this from the callback domain gives the browser somewhere to have
 * come from, so the gateway sees `Referer: https://pay.cianet.ir/`.
 *
 * `referrer: origin` is set explicitly rather than relying on the browser
 * default: the default only happens to send the origin cross-site today, and
 * a stricter future default would silently break payments again.
 *
 * The visible link is the whole point of the fallback — if the script does not
 * run, the user clicks and the click carries the referrer just the same.
 */
function bouncePage(target: string): string {
  const url = escapeHtml(target);
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="origin">
<title>انتقال به درگاه پرداخت</title>
<noscript><meta http-equiv="refresh" content="0; url=${url}"></noscript>
<style>
  :root { color-scheme: dark light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b0b0f; color:#e7e7ea; font-family:Vazirmatn,Tahoma,system-ui,sans-serif; }
  .card { text-align:center; padding:2.5rem 2rem; max-width:22rem; }
  .spin { width:2.5rem; height:2.5rem; margin:0 auto 1.25rem; border-radius:50%;
          border:3px solid #2a2a33; border-top-color:#f60; animation:r .8s linear infinite; }
  @keyframes r { to { transform:rotate(360deg); } }
  h1 { font-size:1.05rem; font-weight:600; margin:0 0 .5rem; }
  p { font-size:.85rem; color:#9a9aa5; margin:0 0 1.5rem; line-height:1.7; }
  a { display:inline-block; background:#f60; color:#fff; text-decoration:none;
      padding:.6rem 1.4rem; border-radius:.5rem; font-size:.85rem; font-weight:600; }
</style>
</head>
<body>
  <div class="card">
    <div class="spin"></div>
    <h1>در حال انتقال به درگاه پرداخت…</h1>
    <p>چند لحظه صبر کنید. اگر خودکار منتقل نشدید، دکمهٔ زیر را بزنید.</p>
    <a href="${url}">ادامه به درگاه پرداخت</a>
  </div>
  <script>setTimeout(function(){ location.replace(${JSON.stringify(target)}); }, 400);</script>
</body>
</html>`;
}

function unavailablePage(): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>پرداخت در دسترس نیست</title>
<style>
  :root { color-scheme: dark light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0b0b0f; color:#e7e7ea; font-family:Vazirmatn,Tahoma,system-ui,sans-serif; }
  .card { text-align:center; padding:2.5rem 2rem; max-width:22rem; }
  h1 { font-size:1.05rem; font-weight:600; margin:0 0 .5rem; }
  p { font-size:.85rem; color:#9a9aa5; margin:0; line-height:1.7; }
</style>
</head>
<body><div class="card">
  <h1>این پرداخت دیگر باز نیست</h1>
  <p>یا قبلاً تکمیل شده یا منقضی شده است. به برنامه برگردید و دوباره تلاش کنید.</p>
</div></body>
</html>`;
}

export async function paymentsModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Hand-off page between the app and the gateway. See bouncePage: this exists
  // because Zibal refuses a navigation with an empty Referer, which is exactly
  // what opening a URL from the desktop shell produces.
  typed.get(
    '/payments/go/:paymentId',
    { schema: { params: z.object({ paymentId: z.string().uuid() }) } },
    async (request, reply) => {
      const payment = await db.query.payments.findFirst({ where: eq(payments.id, request.params.paymentId) });
      if (!payment) throw notFound('Payment');

      const provider = getPaymentProvider(payment.provider);
      const target = payment.providerRef && provider.gatewayUrl ? provider.gatewayUrl(payment.providerRef) : null;

      // helmet sets `referrer-policy: no-referrer` for every API response,
      // which would strip the very header this page exists to produce. The
      // meta tag in the page is specified to override the header, but the
      // whole payment flow should not rest on that subtlety — so the header is
      // corrected here too, for this route only.
      void reply
        .header('referrer-policy', 'origin')
        .header('cache-control', 'no-store')
        .type('text/html; charset=utf-8');
      // Only a payment still waiting to be made gets sent on. Bouncing a paid
      // one to the gateway would show the user a gateway error for a purchase
      // that actually succeeded.
      return payment.status === 'pending' && target ? bouncePage(target) : unavailablePage();
    },
  );

  // Provider redirect target (browser/desktop webview lands here after payment).
  typed.get(
    '/payments/:provider/callback',
    {
      schema: {
        params: z.object({ provider: z.enum(['mock', 'zarinpal', 'zibal', 'idpay']) }),
        querystring: z.object({
          authority: z.string().optional(),
          Authority: z.string().optional(),
          trackId: z.union([z.string(), z.number()]).optional(),
          id: z.string().optional(),
          paymentId: z.string().optional(),
          orderId: z.string().optional(),
          order_id: z.string().optional(),
          status: z.union([z.string(), z.number()]).optional(),
          success: z.union([z.string(), z.number()]).optional(),
        }),
        response: { 200: VerifySchema },
      },
    },
    async (request) => {
      const payment = await resolvePayment(request.query as Record<string, unknown>);
      if (!payment) throw notFound('Payment');
      return verifyAndActivate(payment.id);
    },
  );

  // Same flow as JSON (used by tests and programmatic clients).
  typed.post(
    '/payments/:provider/callback',
    {
      schema: {
        params: z.object({ provider: z.enum(['mock', 'zarinpal', 'zibal', 'idpay']) }),
        body: z.object({
          authority: z.string().optional(),
          Authority: z.string().optional(),
          trackId: z.union([z.string(), z.number()]).optional(),
          id: z.string().optional(),
          paymentId: z.string().optional(),
          orderId: z.string().optional(),
          order_id: z.string().optional(),
          status: z.union([z.string(), z.number()]).optional(),
          success: z.union([z.string(), z.number()]).optional(),
        }),
        response: { 200: VerifySchema },
      },
    },
    async (request) => {
      const payment = await resolvePayment(request.body as Record<string, unknown>);
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
          // Accounts sign up with either an email or a phone, so fall back
          // rather than showing a blank identifier for half the payments.
          userEmail: sql<string>`coalesce(${users.email}, ${users.phone}, ${users.username}, '')`,
          planName: subscriptionPlans.name,
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .innerJoin(subscriptionPlans, eq(payments.planId, subscriptionPlans.id))
        .where(isNull(payments.refundedAt))
        .orderBy(desc(payments.createdAt), asc(payments.id))
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
