import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DeviceInput,
  DevicePublic,
  MySubscription,
  UserPublic,
  UserUpdateInput,
  SubscriptionPlanPublic,
} from '@goh/validation';
import { db } from '../db';
import { devices, favorites, userSessions, users } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { authenticateUser } from '../lib/auth-middleware';
import { verifyPasswordOrDecoy } from '../lib/password';
import { activeSubscriptionFor, entitlementFeaturesFor, hasEntitlement } from '../lib/entitlements';
import { GATED_FEATURES, GATED_FEATURE_KEYS, requireFeature, type GatedFeature } from '../lib/feature-gate';
import { deviceLimitFor } from '../services/subscriptions';

const DevicePublicSchema = DevicePublic;
const MySubscriptionSchema = MySubscription;

export async function usersModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /**
   * Which gated areas this user may use. The desktop app renders its
   * subscription-required states from this rather than deciding locally, so
   * the UI and the server cannot disagree.
   *
   * Advisory only — every gated route re-checks. Faking this response gets a
   * nicer-looking page and nothing else.
   */
  typed.get(
    '/me/features',
    {
      preHandler: [authenticateUser],
      schema: {
        response: {
          200: z.object({
            features: z.record(z.boolean()),
          }),
        },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const held = await entitlementFeaturesFor(userId);
      const features: Record<string, boolean> = {};
      for (const key of GATED_FEATURE_KEYS) {
        features[key] = held.includes(GATED_FEATURES[key]);
      }
      return { features };
    },
  );

  /**
   * The go-ahead a gated feature must obtain before it does anything.
   *
   * Windows Optimizer applies its changes entirely on the machine, so there is
   * no payload for the server to withhold — this is the authorisation step,
   * and it 403s without an active subscription.
   */
  typed.post(
    '/me/features/:feature/authorize',
    {
      preHandler: [authenticateUser],
      schema: {
        params: z.object({ feature: z.enum(GATED_FEATURE_KEYS as [GatedFeature, ...GatedFeature[]]) }),
        response: { 200: z.object({ ok: z.boolean(), feature: z.string() }) },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      if (!(await hasEntitlement(userId, GATED_FEATURES[request.params.feature]))) {
        const { forbidden } = await import('../lib/errors');
        throw forbidden('An active subscription is required for this feature');
      }
      return { ok: true, feature: request.params.feature };
    },
  );

  typed.get(
    '/me',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: UserPublic } },
    },
    async (request) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.user!.id) });
      return {
        id: user!.id,
        phone: user!.phone ?? null,
        phoneVerified: user!.phoneVerified,
        email: user!.email ?? null,
        emailVerified: user!.emailVerified,
        username: user!.username ?? null,
        role: user!.role,
        status: user!.status,
        createdAt: user!.createdAt.toISOString(),
      };
    },
  );

  typed.patch(
    '/me',
    {
      preHandler: [authenticateUser],
      schema: { body: UserUpdateInput, response: { 200: UserPublic } },
    },
    async (request) => {
      const { username } = request.body;
      if (username) {
        const clash = await db.query.users.findFirst({ where: eq(users.username, username) });
        if (clash && clash.id !== request.user!.id) throw conflict('This username is already taken');
      }

      const [row] = await db
        .update(users)
        .set({ ...(username ? { username } : {}), updatedAt: new Date() })
        .where(eq(users.id, request.user!.id))
        .returning();
      return {
        id: row!.id,
        phone: row!.phone ?? null,
        phoneVerified: row!.phoneVerified,
        email: row!.email ?? null,
        emailVerified: row!.emailVerified,
        username: row!.username ?? null,
        role: row!.role,
        status: row!.status,
        createdAt: row!.createdAt.toISOString(),
      };
    },
  );

  typed.get(
    '/me/subscription',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: MySubscriptionSchema } },
    },
    async (request) => {
      const userId = request.user!.id;
      const active = await activeSubscriptionFor(userId);
      const features = await entitlementFeaturesFor(userId);

      let subscription: (typeof MySubscriptionSchema)['_type']['subscription'] = null;
      if (active) {
        subscription = {
          id: active.subscriptionId,
          status: active.status as 'active',
          startDate: active.startDate.toISOString(),
          expirationDate: active.expirationDate.toISOString(),
          plan: {
            id: active.plan.id,
            name: active.plan.name,
            slug: active.plan.slug,
            description: null,
            durationDays: Math.round((active.expirationDate.getTime() - active.startDate.getTime()) / 86_400_000),
            price: 0,
            currency: 'IRR',
            deviceLimit: active.plan.deviceLimit,
            features: active.plan.features,
            sortOrder: 0,
          } satisfies (typeof SubscriptionPlanPublic)['_type'],
        };
      }

      return {
        subscription,
        entitlements: features.map((feature) => ({
          feature,
          grantedAt: active ? active.startDate.toISOString() : new Date().toISOString(),
          expiresAt: active ? active.expirationDate.toISOString() : new Date().toISOString(),
        })),
        isActive: Boolean(active),
      };
    },
  );

  // ---------------------------------------------------------------------
  // Device management (secure registration + plan-enforced limits)
  // ---------------------------------------------------------------------

  typed.get(
    '/me/devices',
    {
      preHandler: [authenticateUser],
      schema: { response: { 200: z.object({ data: z.array(DevicePublicSchema) }) } },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, request.user!.id), isNull(devices.revokedAt)))
        .orderBy(asc(devices.createdAt));
      return {
        data: rows.map((d) => ({
          id: d.id,
          deviceId: d.deviceId,
          name: d.name ?? null,
          platform: d.platform,
          lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    },
  );

  typed.post(
    '/me/devices',
    {
      preHandler: [authenticateUser],
      schema: { body: DeviceInput, response: { 201: DevicePublicSchema } },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { deviceId, name, platform } = request.body;

      const existing = await db.query.devices.findFirst({
        where: and(eq(devices.userId, userId), eq(devices.deviceId, deviceId), isNull(devices.revokedAt)),
      });
      if (existing) {
        // Already registered — return it (idempotent re-registration).
        return {
          id: existing.id,
          deviceId: existing.deviceId,
          name: existing.name ?? null,
          platform: existing.platform,
          lastSeenAt: existing.lastSeenAt ? existing.lastSeenAt.toISOString() : null,
          createdAt: existing.createdAt.toISOString(),
        };
      }

      const limit = await deviceLimitFor(userId);
      const registered = await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
      if (registered.length >= limit) {
        throw conflict(`Device limit of ${limit} reached for your current plan`);
      }

      const [row] = await db
        .insert(devices)
        .values({
          userId,
          deviceId,
          name: name ?? null,
          platform,
          lastSeenAt: new Date(),
        })
        .returning();
      void reply.code(201);
      return {
        id: row!.id,
        deviceId: row!.deviceId,
        name: row!.name ?? null,
        platform: row!.platform,
        lastSeenAt: row!.lastSeenAt ? row!.lastSeenAt.toISOString() : null,
        createdAt: row!.createdAt.toISOString(),
      };
    },
  );

  /**
   * Close the account.
   *
   * The row survives, scrubbed. Payments and subscriptions reference it and
   * are financial records — deleting the user would either orphan them or take
   * them with it, and neither is acceptable for something a customer paid for.
   * What actually leaves is everything personal: the email, phone, username and
   * password hash, plus the devices and favourites that describe the person's
   * machines and taste.
   *
   * The identifiers are set to null rather than blanked, so the unique index
   * frees the address and the same person can sign up again later.
   *
   * The password is required. An access token is enough to read the account;
   * ending it should need something only the account holder knows, because a
   * borrowed laptop with the app open otherwise closes the account.
   */
  typed.delete(
    '/me',
    {
      preHandler: [authenticateUser],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ password: z.string().min(1) }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw notFound('User');

      // An account with no password was created by device registration and has
      // no secret to confirm with; refusing is safer than deleting on a token
      // alone.
      if (!user.passwordHash) throw badRequest('This account has no password set, so it cannot be closed from here');
      if (!(await verifyPasswordOrDecoy(request.body.password, user.passwordHash))) {
        throw badRequest('That password is not correct');
      }

      await db.transaction(async (tx) => {
        await tx.delete(devices).where(eq(devices.userId, userId));
        await tx.delete(favorites).where(eq(favorites.userId, userId));
        await tx.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.userId, userId));
        await tx
          .update(users)
          .set({
            email: null,
            phone: null,
            username: null,
            passwordHash: null,
            emailVerified: false,
            phoneVerified: false,
            deviceId: null,
            status: 'suspended',
            // Kills every access token already issued, not just the sessions.
            tokenVersion: user.tokenVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      return { ok: true };
    },
  );

  typed.delete(
    '/me/devices/:id',
    {
      preHandler: [authenticateUser],
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (request) => {
      const device = await db.query.devices.findFirst({
        where: and(eq(devices.id, request.params.id), eq(devices.userId, request.user!.id)),
      });
      if (!device) throw notFound('Device');

      // Soft revoke — the device id stays reserved for abuse tracking.
      await db.update(devices).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(devices.id, device.id));
      return { ok: true };
    },
  );

}
