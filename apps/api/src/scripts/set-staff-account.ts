/**
 * Create or refresh a staff account: an ordinary customer login that happens to
 * hold a subscription which does not run out.
 *
 *   DATABASE_URL=… npx tsx src/scripts/set-staff-account.ts <email> --password-stdin
 *
 * This exists because testing the product as a customer and running it as an
 * admin are different jobs. An admin session opens the panel; it does not make
 * the paid areas work, because those are gated on an *entitlement*, which comes
 * from a subscription on a user account. Without this, testing a purchase-gated
 * feature meant either buying it or hand-editing rows in production.
 *
 * The subscription hangs off a plan of its own, `staff`, kept `inactive` so it
 * never appears in the plans customers are offered — an internal plan that
 * showed up in the pricing list would be worse than no plan at all. It carries
 * every feature any real plan carries, so a staff account can reach everything
 * a paying customer can.
 *
 * The password is read from stdin, never argv, so it stays out of shell history
 * and `ps`.
 */
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { subscriptionPlans, subscriptions, users } from '../db/schema';
import { hashPassword } from '../lib/password';

/** Every feature any published plan grants, so staff are never the ones who
 *  cannot reproduce a customer's problem. */
const STAFF_FEATURES = [
  'premium_optimization',
  'automatic_hardware_detection',
  'one_click_optimization',
  'priority_support',
];

/** Far enough out to outlive the product; the row is still a real, ordinary
 *  subscription that every existing check reads without a special case. */
const NEVER = new Date('2099-12-31T00:00:00Z');

function readPassword(): string {
  if (!process.argv.includes('--password-stdin')) {
    throw new Error('Pass --password-stdin and pipe the password in; it is never taken from argv.');
  }
  return readFileSync(0, 'utf-8').replace(/\r?\n$/, '');
}

/** The internal plan, created on first use. Never offered for sale. */
async function staffPlan() {
  const existing = await db.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.slug, 'staff'),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(subscriptionPlans)
    .values({
      name: 'Staff',
      slug: 'staff',
      description: 'Internal testing access. Not for sale.',
      durationDays: 3650,
      price: 0,
      // `inactive` is what keeps it out of the plans customers are shown.
      status: 'inactive',
      deviceLimit: 5,
      features: STAFF_FEATURES,
      sortOrder: 999,
    })
    .returning();
  return created!;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || email.startsWith('--')) {
    process.stderr.write('Usage: set-staff-account.ts <email> --password-stdin\n');
    process.exit(1);
  }

  const password = readPassword();
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const passwordHash = await hashPassword(password);

  const plan = await staffPlan();

  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user) {
    // Rotating the password has to invalidate tokens issued against the old
    // one, exactly as a real password change does.
    await db
      .update(users)
      .set({
        passwordHash,
        emailVerified: true,
        status: 'active',
        tokenVersion: user.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash, emailVerified: true, status: 'active' })
      .returning();
    user = created!;
  }

  // Retire whatever is active first. Two active subscriptions is a state the
  // rest of the app does not expect, and `activeSubscriptionFor` would pick
  // between them by creation date rather than by which one is right.
  const retired = await db
    .update(subscriptions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'active')))
    .returning({ id: subscriptions.id });

  await db.insert(subscriptions).values({
    userId: user.id,
    planId: plan.id,
    startDate: new Date(),
    expirationDate: NEVER,
    status: 'active',
  });

  process.stdout.write(
    `✅ ${email} is a staff account: ${plan.name} plan, ${STAFF_FEATURES.length} features, ` +
      `valid to ${NEVER.toISOString().slice(0, 10)}` +
      (retired.length ? `; retired ${retired.length} previous subscription(s)` : '') +
      '.\n',
  );
}

main()
  .catch((err) => {
    process.stderr.write(`❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
