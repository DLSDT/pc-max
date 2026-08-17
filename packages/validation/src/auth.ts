import { z } from 'zod';
import { AdminRole } from './enums';

export const AdminLoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
export type AdminLoginInput = z.infer<typeof AdminLoginInput>;

export const AuthResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  admin: z.object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string(),
    role: AdminRole,
    permissions: z.array(z.string()),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

export const AdminMe = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: AdminRole,
  permissions: z.array(z.string()),
  lastLoginAt: z.string().nullable(),
});
export type AdminMe = z.infer<typeof AdminMe>;

/** Anonymous desktop device registration. */
export const DeviceRegisterInput = z.object({
  deviceId: z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(/^[a-zA-Z0-9-]+$/),
  platform: z.enum(['windows']).default('windows'),
  appVersion: z.string().trim().max(50).optional(),
});
export type DeviceRegisterInput = z.infer<typeof DeviceRegisterInput>;

export const DeviceRegisterResponse = z.object({
  userId: z.string().uuid(),
  deviceId: z.string(),
  createdAt: z.string(),
});
export type DeviceRegisterResponse = z.infer<typeof DeviceRegisterResponse>;

/** Anonymous view event for privacy-friendly analytics. */
export const ViewEventInput = z.object({
  deviceId: z.string().trim().min(8).max(200).optional(),
  gameId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
});
export type ViewEventInput = z.infer<typeof ViewEventInput>;

/** Admin user management (super_admin only). */
export const AdminCreateInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(200),
  password: z.string().min(8).max(200),
  role: AdminRole,
});
export type AdminCreateInput = z.infer<typeof AdminCreateInput>;

export const AdminUpdateInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: AdminRole.optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});
export type AdminUpdateInput = z.infer<typeof AdminUpdateInput>;
