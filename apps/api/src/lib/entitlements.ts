import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '../db';
import { entitlements, subscriptionPlans, subscriptions } from '../db/schema';

/**
 * Server-side entitlement checks. The desktop client never decides whether a
 * user is premium — every premium operation asks the server.
 */

export interface ActiveSubscription {
  subscriptionId: string;
  status: string;
  startDate: Date;
  expirationDate: Date;
  plan: {
    id: string;
    name: string;
    slug: string;
    deviceLimit: number;
    features: string[];
  };
}

/** The user's current active (non-expired) subscription, if any. */
export async function activeSubscriptionFor(userId: string): Promise<ActiveSubscription | null> {
  const row = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active'), gt(subscriptions.expirationDate, new Date())),
    orderBy: [desc(subscriptions.createdAt)],
  });
  if (!row) return null;

  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, row.planId) });
  if (!plan) return null;

  return {
    subscriptionId: row.id,
    status: row.status,
    startDate: row.startDate,
    expirationDate: row.expirationDate,
    plan: {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      deviceLimit: plan.deviceLimit,
      features: plan.features,
    },
  };
}

/**
 * Feature names the user is currently entitled to (e.g. premium_optimization).
 *
 * A feature is entitled only while BOTH hold:
 *   - the entitlement row is unexpired, AND
 *   - its owning subscription is `active` and unexpired.
 *
 * Joining through the subscription row means admin suspend/revoke immediately
 * kills the entitlement (no subscription-bypass window), and a subscription
 * that expired naturally revokes access even if an entitlement row lingers.
 */
export async function entitlementFeaturesFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ feature: entitlements.feature })
    .from(entitlements)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.id, entitlements.subscriptionId), eq(subscriptions.status, 'active'), gt(subscriptions.expirationDate, new Date())),
    )
    .where(and(eq(entitlements.userId, userId), gt(entitlements.expiresAt, new Date())));
  return rows.map((r) => r.feature);
}

/** True when the user holds the given entitlement on an active subscription. */
export async function hasEntitlement(userId: string, feature: string): Promise<boolean> {
  return (await entitlementFeaturesFor(userId)).includes(feature);
}
