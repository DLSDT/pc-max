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
import { devices, users } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { authenticateUser } from '../lib/auth-middleware';
import { activeSubscriptionFor, entitlementFeaturesFor } from '../lib/entitlements';
import { deviceLimitFor } from '../services/subscriptions';

const DevicePublicSchema = DevicePublic;
const MySubscriptionSchema = MySubscription;

export async function usersModule(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

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
