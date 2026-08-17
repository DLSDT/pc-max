import { z } from 'zod';
import { PlanStatus, SubscriptionStatus } from './enums';
import { IsoDate } from './enums';

/** Public subscription plan (what the desktop app shows in the store). */
export const SubscriptionPlanPublic = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  durationDays: z.number().int(),
  price: z.number().int(),
  currency: z.string(),
  deviceLimit: z.number().int(),
  features: z.array(z.string()),
  sortOrder: z.number().int(),
});
export type SubscriptionPlanPublic = z.infer<typeof SubscriptionPlanPublic>;

/** Create / update a plan (admin only). Nothing about plans is hardcoded. */
export const SubscriptionPlanInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, digits and dashes'),
  description: z.string().trim().max(1000).optional(),
  durationDays: z.number().int().min(1).max(3650),
  price: z.number().int().min(0),
  currency: z.string().trim().min(3).max(8).default('IRR'),
  deviceLimit: z.number().int().min(1).max(50).default(1),
  features: z.array(z.string().trim().min(1).max(200)).min(1),
  status: PlanStatus.default('active'),
  sortOrder: z.number().int().default(0),
});
export type SubscriptionPlanInput = z.infer<typeof SubscriptionPlanInput>;

export const SubscriptionPlanUpdateInput = SubscriptionPlanInput.partial();
export type SubscriptionPlanUpdateInput = z.infer<typeof SubscriptionPlanUpdateInput>;

/** Begin a purchase: creates a payment + pending subscription (idempotent). */
export const PurchaseInput = z.object({
  planId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
});
export type PurchaseInput = z.infer<typeof PurchaseInput>;

export const PurchaseResponse = z.object({
  paymentId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  provider: z.string(),
  redirectUrl: z.string().nullable(),
  status: z.string(),
});
export type PurchaseResponse = z.infer<typeof PurchaseResponse>;

/** A feature grant on an active subscription. */
export const EntitlementPublic = z.object({
  feature: z.string(),
  grantedAt: z.string(),
  expiresAt: z.string(),
});
export type EntitlementPublic = z.infer<typeof EntitlementPublic>;

export const MySubscription = z.object({
  subscription: z
    .object({
      id: z.string().uuid(),
      status: SubscriptionStatus,
      startDate: z.string(),
      expirationDate: z.string(),
      plan: SubscriptionPlanPublic,
    })
    .nullable(),
  entitlements: z.array(EntitlementPublic),
  /** True when the user has an active, non-expired subscription. */
  isActive: z.boolean(),
});
export type MySubscription = z.infer<typeof MySubscription>;

/** Secure device registration. The client generates a strong random device ID
 *  and stores it in the OS keychain — never sent as a raw hardware ID. */
export const DeviceInput = z.object({
  deviceId: z
    .string()
    .trim()
    .min(16)
    .max(200)
    .regex(/^[a-zA-Z0-9-]+$/),
  name: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(['windows']).default('windows'),
});
export type DeviceInput = z.infer<typeof DeviceInput>;

export const DevicePublic = z.object({
  id: z.string().uuid(),
  deviceId: z.string(),
  name: z.string().nullable(),
  platform: z.string(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DevicePublic = z.infer<typeof DevicePublic>;

/** Admin: manually grant a subscription to a user (no payment involved). */
export const ManualSubscriptionInput = z.object({
  planId: z.string().uuid(),
  durationDays: z.number().int().min(1).max(3650).optional(),
  startDate: IsoDate.optional(),
});
export type ManualSubscriptionInput = z.infer<typeof ManualSubscriptionInput>;

/** Admin: extend or change the status of a subscription. */
export const AdminSubscriptionPatch = z.object({
  status: SubscriptionStatus.optional(),
  extendDays: z.number().int().min(1).max(3650).optional(),
});
export type AdminSubscriptionPatch = z.infer<typeof AdminSubscriptionPatch>;
