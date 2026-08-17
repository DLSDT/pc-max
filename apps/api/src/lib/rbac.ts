import type { AdminRole } from '@goh/validation';

/**
 * Permission matrix. Each permission lists the roles allowed to perform it.
 * Enforced server-side in route preHandlers — never trusted from the client.
 */
export const PERMISSIONS = {
  'games.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'games.write': ['super_admin', 'admin', 'editor'],
  'games.delete': ['super_admin', 'admin'],
  'games.publish': ['super_admin', 'admin'],
  'optimizations.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'optimizations.write': ['super_admin', 'admin', 'editor'],
  'optimizations.delete': ['super_admin', 'admin'],
  'optimizations.publish': ['super_admin', 'admin'],
  'taxonomy.write': ['super_admin', 'admin', 'editor'],
  'taxonomy.delete': ['super_admin', 'admin'],
  'analytics.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'audit.read': ['super_admin', 'admin'],
  'releases.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'releases.write': ['super_admin', 'admin'],
  'admins.manage': ['super_admin'],
  'users.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'users.write': ['super_admin', 'admin'],
  'subscriptions.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'subscriptions.write': ['super_admin', 'admin'],
  'payments.read': ['super_admin', 'admin', 'viewer'],
  'packages.read': ['super_admin', 'admin', 'editor', 'viewer'],
  'packages.write': ['super_admin', 'admin', 'editor'],
  'packages.publish': ['super_admin', 'admin'],
  'packages.delete': ['super_admin', 'admin'],
  'devices.read': ['super_admin', 'admin', 'viewer'],
  'devices.write': ['super_admin', 'admin'],
  'settings.read': ['super_admin', 'admin', 'viewer'],
  'settings.write': ['super_admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** Whether a role is allowed to perform the given permission. */
export function can(role: AdminRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}

/** All permissions granted to a role (used for the admin profile payload). */
export function permissionsFor(role: AdminRole): string[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
