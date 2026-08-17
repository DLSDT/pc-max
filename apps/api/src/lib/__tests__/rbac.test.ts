import { describe, expect, it } from 'vitest';
import { can, permissionsFor } from '../rbac';

describe('RBAC', () => {
  it('grants the expected permissions per role', () => {
    expect(can('super_admin', 'admins.manage')).toBe(true);
    expect(can('admin', 'admins.manage')).toBe(false);
    expect(can('admin', 'games.delete')).toBe(true);
    expect(can('editor', 'games.delete')).toBe(false);
    expect(can('editor', 'games.write')).toBe(true);
    expect(can('viewer', 'games.write')).toBe(false);
    expect(can('viewer', 'analytics.read')).toBe(true);
    expect(can('viewer', 'audit.read')).toBe(false);
  });

  it('returns permission lists for a role', () => {
    const perms = permissionsFor('super_admin');
    expect(perms).toContain('admins.manage');
    expect(perms).toContain('games.write');
  });
});
