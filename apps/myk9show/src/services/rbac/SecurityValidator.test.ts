import { describe, it, expect, vi } from 'vitest';
import { SecurityValidator } from './SecurityValidator';
import type { Role, Permission } from '@/types/rbac-types';

// Not in the original target list, but SecurityValidator.validatePermissionEscalation
// is the actual security gate behind RBACService.assignRole (see
// services/rbac/RBACService.ts assignRole()) and is genuinely decision-table
// shaped, so it's covered here alongside the requested RBACService/RoleManager suites.

function buildValidator(opts: {
  checkPermission?: (userId: string, permission: string) => Promise<boolean>;
  roles?: Role[];
  rolePermissions?: { permission_id: string; permission: Permission }[];
  checkSiteAdminDirectly?: (authUserId: string) => Promise<boolean>;
}) {
  return new SecurityValidator(
    opts.checkPermission ?? (async () => false),
    async () => opts.roles ?? [],
    async () => opts.rolePermissions ?? [],
    opts.checkSiteAdminDirectly
  );
}

const REGULAR_ROLE: Role = {
  id: 'role-secretary',
  name: 'secretary',
  description: null,
  is_system: false,
  permissions: null,
  created_at: null,
};

const SYSTEM_ROLE: Role = {
  id: 'role-system',
  name: 'super_role',
  description: null,
  is_system: true,
  permissions: null,
  created_at: null,
};

const ADMIN_PERMISSION_ROLE: Role = {
  id: 'role-admin-perms',
  name: 'quasi_admin',
  description: null,
  is_system: false,
  permissions: null,
  created_at: null,
};

/**
 * Decision table: actor state x target role -> escalation validation outcome.
 * Derived from services/rbac/SecurityValidator.ts#validatePermissionEscalation.
 */
describe('SecurityValidator.validatePermissionEscalation', () => {
  it('site admin actor -> always valid, short-circuits every other check', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => true,
      roles: [],
    });
    const result = await validator.validatePermissionEscalation('admin-1', 'target-1', 'anything');
    expect(result).toEqual({ isValid: true });
  });

  it('non-admin assigning a role to THEMSELVES -> denied (self-escalation guard)', async () => {
    const validator = buildValidator({ checkSiteAdminDirectly: async () => false });
    const result = await validator.validatePermissionEscalation('user-1', 'user-1', 'secretary');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/cannot assign roles to themselves/i);
  });

  it('actor lacking role:assign permission -> denied', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => false,
      checkPermission: async () => false,
    });
    const result = await validator.validatePermissionEscalation('actor-1', 'target-1', 'secretary');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/does not have permission to assign roles/i);
  });

  it('target role does not exist -> denied', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => false,
      checkPermission: async () => true,
      roles: [],
    });
    const result = await validator.validatePermissionEscalation(
      'actor-1',
      'target-1',
      'nonexistent-role'
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/does not exist/i);
  });

  it('non-admin actor assigning a system role -> denied', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => false,
      checkPermission: async () => true,
      roles: [SYSTEM_ROLE],
    });
    const result = await validator.validatePermissionEscalation(
      'actor-1',
      'target-1',
      SYSTEM_ROLE.name
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/only site administrators can assign system roles/i);
  });

  it('non-admin actor assigning a role whose permission_id contains "admin" -> denied', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => false,
      checkPermission: async () => true,
      roles: [ADMIN_PERMISSION_ROLE],
      rolePermissions: [
        {
          permission_id: 'admin:manage',
          permission: {
            id: 'p1',
            code: 'admin:manage',
            name: 'Manage admin',
            description: null,
            category: null,
            created_at: null,
          },
        },
      ],
    });
    const result = await validator.validatePermissionEscalation(
      'actor-1',
      'target-1',
      ADMIN_PERMISSION_ROLE.name
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/administrative permissions/i);
  });

  it('non-admin actor assigning an ordinary non-system, non-admin role -> valid', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => false,
      checkPermission: async () => true,
      roles: [REGULAR_ROLE],
      rolePermissions: [
        {
          permission_id: 'show:manage',
          permission: {
            id: 'p2',
            code: 'show:manage',
            name: 'Manage show',
            description: null,
            category: null,
            created_at: null,
          },
        },
      ],
    });
    const result = await validator.validatePermissionEscalation(
      'actor-1',
      'target-1',
      REGULAR_ROLE.name
    );
    expect(result).toEqual({ isValid: true });
  });

  it('unexpected error during validation -> fails closed (denied)', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => {
        throw new Error('boom');
      },
      checkPermission: async () => {
        throw new Error('should not reach here on the non-system path');
      },
      roles: [],
    });
    // isUserSiteAdmin swallows the thrown error internally and returns false,
    // so this exercises the self-escalation branch's downstream checkPermission
    // throw, which the outer try/catch must fail closed on.
    const result = await validator.validatePermissionEscalation('actor-1', 'target-1', 'secretary');
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/security validation failed/i);
  });
});

describe('SecurityValidator.isUserSiteAdmin', () => {
  it('uses the direct site-admin check when provided', async () => {
    const directCheck = vi.fn().mockResolvedValue(true);
    const validator = buildValidator({ checkSiteAdminDirectly: directCheck });
    expect(await validator.isUserSiteAdmin('user-1')).toBe(true);
    expect(directCheck).toHaveBeenCalledWith('user-1');
  });

  it('direct check throwing -> false (fail closed), not propagated', async () => {
    const validator = buildValidator({
      checkSiteAdminDirectly: async () => {
        throw new Error('rpc failure');
      },
    });
    expect(await validator.isUserSiteAdmin('user-1')).toBe(false);
  });

  it('falls back to checkPermission("admin:manage") when no direct check is configured', async () => {
    const checkPermission = vi.fn().mockResolvedValue(true);
    const validator = new SecurityValidator(
      checkPermission,
      async () => [],
      async () => []
    );
    expect(await validator.isUserSiteAdmin('user-1')).toBe(true);
    expect(checkPermission).toHaveBeenCalledWith('user-1', 'admin:manage');
  });
});
