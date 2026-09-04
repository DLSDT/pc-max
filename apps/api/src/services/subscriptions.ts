import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db';
import { devices, entitlements, payments, subscriptionPlans, subscriptions } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';

/** Create a pending payment + subscription for a plan (idempotent per key). */
export async function createPurchase(userId: string, planId: string, idempotencyKey: string, providerName: string) {
  const plan = await db.query.subscriptionPlans.findFirst({
    where: and(eq(subscriptionPlans.id, planId), eq(subscriptionPlans.status, 'active')),
  });
  if (!plan) throw notFound('Subscription plan');

  // Idempotency: a retried request with the same key returns the same payment.
  const existing = await db.query.payments.findFirst({ where: eq(payments.idempotencyKey, idempotencyKey) });
  if (existing) {
    const pendingSub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.paymentId, existing.id) });
    return {
      paymentId: existing.id,
      subscriptionId: pendingSub?.id ?? '',
      status: existing.status,
      plan,
      existing: true,
    };
  }

  const now = new Date();
  const provisionalExpiration = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .insert(payments)
      .values({
        userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        provider: providerName,
        status: 'pending',
        idempotencyKey,
      })
      .returning();
    const paymentRow = payment!;

    const [subscription] = await tx
      .insert(subscriptions)
      .values({
        userId,
        planId: plan.id,
        startDate: now,
        expirationDate: provisionalExpiration,
        status: 'pending',
        paymentId: paymentRow.id,
      })
      .returning();

    return {
      paymentId: paymentRow.id,
      subscriptionId: subscription!.id,
      status: paymentRow.status,
      plan,
      existing: false,
    };
  });
}

/**
 * Activate a subscription after a successful SERVER-SIDE payment verification.
 * Idempotent: a payment already marked `paid` returns the existing subscription
 * instead of double-activating.
 */
export async function activatePayment(paymentId: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!payment) throw notFound('Payment');

  // Idempotency: a second callback for the same payment returns the existing
  // subscription instead of double-activating.
  if (payment.status === 'paid') {
    const existing = await db.query.subscriptions.findFirst({ where: eq(subscriptions.paymentId, payment.id) });
    if (existing) return existing;
  }
  if (payment.status !== 'pending') throw badRequest(`Payment is already ${payment.status}`);

  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, payment.planId) });
  if (!plan) throw notFound('Subscription plan');

  return db.transaction(async (tx) => {
    const now = new Date();

    // Renewing adds to what is left rather than replacing it. Counting from
    // `now` meant a user with twenty days still on the clock who bought thirty
    // more ended up with thirty — the twenty they had already paid for were
    // quietly taken back, and nothing told them.
    const current = await tx.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, payment.userId), eq(subscriptions.status, 'active')),
      orderBy: desc(subscriptions.expirationDate),
    });
    const startFrom = current && current.expirationDate > now ? current.expirationDate : now;
    const expiration = new Date(startFrom.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const [updated] = await tx
      .update(subscriptions)
      .set({ status: 'active', startDate: now, expirationDate: expiration, updatedAt: now })
      .where(and(eq(subscriptions.paymentId, payment.id), eq(subscriptions.status, 'pending')))
      .returning();
    if (!updated) throw conflict('Subscription is not in a pending state');

    // The superseded row is retired in the same transaction, so exactly one
    // subscription is ever active for a user. Two would make "which plan am I
    // on" and the device limit depend on which row a query happened to find.
    if (current && current.id !== updated.id) {
      await tx
        .update(subscriptions)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(subscriptions.id, current.id));
    }

    await tx.update(payments).set({ status: 'paid', updatedAt: now }).where(eq(payments.id, payment.id));

    for (const feature of plan.features) {
      await tx.insert(entitlements).values({
        userId: payment.userId,
        subscriptionId: updated.id,
        feature,
        expiresAt: expiration,
      });
    }

    return updated;
  });
}

/** Admin: manually grant an active subscription (support flow, no payment). */
export async function grantManualSubscription(userId: string, planId: string, durationDaysOverride?: number) {
  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId) });
  if (!plan) throw notFound('Subscription plan');

  const now = new Date();
  const days = durationDaysOverride ?? plan.durationDays;
  const expiration = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .insert(subscriptions)
      .values({ userId, planId: plan.id, startDate: now, expirationDate: expiration, status: 'active' })
      .returning();
    const row = subscription!;

    for (const feature of plan.features) {
      await tx.insert(entitlements).values({ userId, subscriptionId: row.id, feature, expiresAt: expiration });
    }
    return row;
  });
}

/** Count of currently registered (non-revoked) devices for a user. */
export async function registeredDeviceCount(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
  return rows[0]?.value ?? 0;
}

/** Ensure the user has a registered slot for another device under their plan. */
export async function assertDeviceSlotAvailable(userId: string, deviceLimit: number): Promise<void> {
  const current = await registeredDeviceCount(userId);
  if (current >= deviceLimit) {
    throw conflict(`Device limit of ${deviceLimit} reached for your current plan`);
  }
}

export async function deviceLimitFor(userId: string): Promise<number> {
  const active = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'), gt(subscriptions.expirationDate, new Date())),
    orderBy: [desc(subscriptions.createdAt)],
  });
  if (!active) return 1; // free tier: a single device
  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, active.planId) });
  return plan?.deviceLimit ?? 1;
}
