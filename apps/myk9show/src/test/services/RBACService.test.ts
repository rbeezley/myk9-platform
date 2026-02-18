/**
 * RBAC Service Unit Tests
 * Phase 5: Testing - Comprehensive unit tests for permission checking logic
 * Created: December 2024
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RBACService } from '@/services/rbac/RBACService';
import { mockSupabase } from '@/test/mocks/supabase';
// import { ActionType } from '@/types/rbac-types'; // Not used in current tests

describe('RBACService', () => {
  let rbacService: RBACService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get fresh instance
    rbacService = RBACService.getInstance();

    // Clear cache
    rbacService.clearAllCache();

    // Mock user auth
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Permission Checking', () => {
    it('should return true for valid permission', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await rbacService.checkPermission('user123', 'show:create');

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('user_has_permission', {
        user_id: 'user123',
        permission_name: 'show:create',
        scope_type: null,
        scope_id: null,
      });
    });

    it('should return false for invalid permission', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

      const result = await rbacService.checkPermission('user123', 'admin:delete');

      expect(result).toBe(false);
    });

    it('should handle permission check with scope', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await rbacService.checkPermission('user123', 'show:manage', {
        type: 'club',
        id: 'club456',
      });

      expect(result).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('user_has_permission', {
        user_id: 'user123',
        permission_name: 'show:manage',
        scope_type: 'club',
        scope_id: 'club456',
      });
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      const result = await rbacService.checkPermission('user123', 'show:create');

      expect(result).toBe(false);
    });

    it('should use cache for repeated permission checks', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      // First call should hit database
      const result1 = await rbacService.checkPermission('user123', 'show:create');
      expect(result1).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await rbacService.checkPermission('user123', 'show:create');
      expect(result2).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1); // No additional database call
    });

    it('should clear cache for specific user', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      // Cache a permission
      await rbacService.checkPermission('user123', 'show:create');
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);

      // Clear cache for user
      rbacService.clearUserCache('user123');

      // Next call should hit database again
      await rbacService.checkPermission('user123', 'show:create');
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    });
  });

  describe('Role Assignment', () => {
    it('should assign role to user successfully using roleId', async () => {
      const mockRole = {
        id: 'role123',
        name: 'secretary',
        description: null,
        is_system: false,
        permissions: [],
        created_at: '',
      };
      const mockUserRole = { id: 'assignment-id' };

      // Mock getRole call (from.select.eq.single for roles table)
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockRole, error: null }),
              }),
            }),
          };
        }
        if (table === 'user_roles') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockUserRole, error: null }),
              }),
            }),
          };
        }
        if (table === 'permission_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return {
          select: vi
            .fn()
            .mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
        };
      });

      const result = await rbacService.assignRole({
        userId: 'user123',
        roleId: 'role123',
      });

      expect(result).toBe('assignment-id');
    });

    it('should throw when role is not found by name', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      });

      await expect(
        rbacService.assignRole({
          userId: 'user123',
          roleName: 'nonexistent-role',
        })
      ).rejects.toThrow();
    });

    it('should throw when neither roleName nor roleId is provided', async () => {
      await expect(
        rbacService.assignRole({
          userId: 'user123',
        } as Parameters<typeof rbacService.assignRole>[0])
      ).rejects.toThrow('Either roleName or roleId must be provided');
    });
  });

  describe('Role Revocation', () => {
    it('should throw when role is not found for revocation', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Role not found' } }),
          }),
        }),
      });

      await expect(
        rbacService.revokeRole({
          userId: 'user123',
          roleName: 'nonexistent-role',
        })
      ).rejects.toThrow();
    });

    it('should revoke role from user successfully', async () => {
      const mockRole = { id: 'role123', name: 'secretary' };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockRole, error: null }),
              }),
            }),
          };
        }
        if (table === 'user_roles') {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'permission_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await rbacService.revokeRole({
        userId: 'user123',
        roleName: 'secretary',
      });

      expect(result).toBe(true);
    });
  });

  describe('Role Management', () => {
    it('should create role successfully', async () => {
      const mockRole = {
        id: 'new-role-id',
        name: 'custom-role',
        display_name: 'Custom Role',
        description: 'A custom role',
        is_system: false,
        permissions: [],
        created_at: '',
      };

      const mockPermissions = [
        {
          id: 'perm1',
          code: 'show:create',
          name: 'Show Create',
          description: null,
          category: 'show',
          created_at: '',
        },
        {
          id: 'perm2',
          code: 'show:read',
          name: 'Show Read',
          description: null,
          category: 'show',
          created_at: '',
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockRole, error: null }),
              }),
            }),
          };
        }
        if (table === 'permissions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockPermissions, error: null }),
            }),
          };
        }
        if (table === 'role_permissions') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        if (table === 'permission_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const result = await rbacService.createRole({
        name: 'custom-role',
        displayName: 'Custom Role',
        description: 'A custom role',
        permissions: ['show:create', 'show:read'],
      });

      expect(result.id).toBe('new-role-id');
      expect(result.name).toBe('custom-role');
    });

    it('should handle role creation errors', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: null, error: { message: 'Creation failed' } }),
          }),
        }),
      });

      await expect(
        rbacService.createRole({
          name: 'invalid-role',
          displayName: 'Invalid Role',
          permissions: [],
        })
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('Security Validation', () => {
    it('should prevent self-privilege escalation for non-admins', async () => {
      // Mock non-admin user
      mockSupabase.rpc.mockResolvedValueOnce({ data: false, error: null }); // isUserSiteAdmin

      const result = await rbacService.validatePermissionEscalation(
        'user123',
        'user123', // same user
        'admin'
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('cannot assign roles to themselves');
    });

    it('should allow self-assignment for site admins', async () => {
      // isUserSiteAdmin → checkPermission('admin:manage') → RPC call 1: true
      // canAssignRole → checkPermission('role:assign') → RPC call 2: true
      // getAllRoles → from('roles').select('*').order('name') → returns secretary role
      // getRolePermissions → from('role_permissions').select(...).eq('role_id', id) → returns []
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: true, error: null }) // admin:manage
        .mockResolvedValueOnce({ data: true, error: null }); // role:assign

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'role1',
                    name: 'secretary',
                    is_system: false,
                    permissions: [],
                    description: null,
                    created_at: '',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'role_permissions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await rbacService.validatePermissionEscalation(
        'admin123',
        'admin123',
        'secretary'
      );

      expect(result.isValid).toBe(true);
    });

    it('should prevent assignment of non-existent roles', async () => {
      // actor !== target, so no self-check
      // canAssignRole → RPC: true
      // getAllRoles → from('roles').select('*').order('name') → returns empty array → role not found
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null }); // role:assign

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await rbacService.validatePermissionEscalation(
        'admin123',
        'user456',
        'non-existent-role'
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('does not exist');
    });

    it('should validate bulk operations within limits', async () => {
      // Mock permission check
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await rbacService.validateBulkOperation(
        'admin123',
        'assign_role',
        ['user1', 'user2', 'user3'], // 3 users - within limit
        ['role1']
      );

      expect(result.isValid).toBe(true);
    });

    it('should reject bulk operations exceeding limits for non-admins', async () => {
      // Mock non-admin user
      mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null }); // bulk permission
      mockSupabase.rpc.mockResolvedValueOnce({ data: false, error: null }); // site admin check

      const tooManyUsers = Array.from({ length: 60 }, (_, i) => `user${i}`);

      const result = await rbacService.validateBulkOperation(
        'user123',
        'assign_role',
        tooManyUsers,
        ['role1']
      );

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('exceeds limit');
    });
  });

  describe('Permission Inheritance', () => {
    it('should resolve manage permissions to CRUD permissions', () => {
      const permissions = ['show:manage', 'entry:read'];

      const resolved = rbacService.resolvePermissionInheritance(permissions);

      expect(resolved).toContain('show:manage');
      expect(resolved).toContain('show:create');
      expect(resolved).toContain('show:read');
      expect(resolved).toContain('show:update');
      expect(resolved).toContain('show:delete');
      expect(resolved).toContain('entry:read');
    });

    it('should not duplicate existing permissions', () => {
      const permissions = ['show:manage', 'show:create', 'show:read'];

      const resolved = rbacService.resolvePermissionInheritance(permissions);

      // Count occurrences of show:create
      const createCount = resolved.filter(p => p === 'show:create').length;
      expect(createCount).toBe(1);
    });

    it('should handle multiple manage permissions', () => {
      const permissions = ['show:manage', 'entry:manage', 'judge:view'];

      const resolved = rbacService.resolvePermissionInheritance(permissions);

      // Should have show CRUD permissions
      expect(resolved).toContain('show:create');
      expect(resolved).toContain('show:read');
      expect(resolved).toContain('show:update');
      expect(resolved).toContain('show:delete');

      // Should have entry CRUD permissions
      expect(resolved).toContain('entry:create');
      expect(resolved).toContain('entry:read');
      expect(resolved).toContain('entry:update');
      expect(resolved).toContain('entry:delete');

      // Should preserve non-manage permissions
      expect(resolved).toContain('judge:view');
    });
  });

  describe('Organization Permission Overrides', () => {
    it('should return true when scoped permission is granted even without base permission', async () => {
      // The service calls checkPermission twice when organizationId is provided:
      // 1. base permission check (returns false)
      // 2. scoped permission check (returns true → grants via OR logic)
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: false, error: null }) // base check
        .mockResolvedValueOnce({ data: true, error: null }); // scoped check

      const result = await rbacService.checkPermissionWithOrganization(
        'user123',
        'show:create',
        'org456'
      );

      expect(result).toBe(true);
    });

    it('should return false when both base and scoped permission are denied', async () => {
      // The service uses base OR scoped logic — both must be false to deny
      mockSupabase.rpc
        .mockResolvedValueOnce({ data: false, error: null }) // base check
        .mockResolvedValueOnce({ data: false, error: null }); // scoped check

      const result = await rbacService.checkPermissionWithOrganization(
        'user123',
        'show:create',
        'org456'
      );

      expect(result).toBe(false);
    });

    it('should fallback to base permission without organization context', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

      const result = await rbacService.checkPermissionWithOrganization(
        'user123',
        'show:create'
        // No organization ID
      );

      expect(result).toBe(true);
      // Should only check base permission
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data Integrity', () => {
    it('should validate role permission integrity when all references are valid', async () => {
      // validateRolePermissionIntegrity calls:
      // 1. getAllRoles() → from('roles').select('*').eq('is_system', false).order('name')
      // 2. getAllPermissions() → from('permissions').select('*').order('category')
      // 3. for each role: getRolePermissions(role.id) → from('role_permissions').select(...).eq('role_id', id)
      const mockRole = {
        id: 'role1',
        name: 'test-role',
        is_system: false,
        permissions: [],
        description: null,
        created_at: '',
      };
      const mockPermission = {
        id: 'perm1',
        code: 'test:permission',
        name: 'Test',
        description: null,
        category: 'test',
        created_at: '',
      };
      const mockRolePermission = { permission_id: 'perm1', permissions: mockPermission };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          // getAllRoles: from('roles').select('*').order('name')
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockRole],
                error: null,
              }),
            }),
          };
        }
        if (table === 'permissions') {
          // getAllPermissions: from('permissions').select('*').order('code')
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockPermission],
                error: null,
              }),
            }),
          };
        }
        if (table === 'role_permissions') {
          // getRolePermissions: from('role_permissions').select(...).eq('role_id', id)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [mockRolePermission],
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await rbacService.validateRolePermissionIntegrity();

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect invalid permission references in roles', async () => {
      // A role_permission that references a permission_id not in the permissions list
      const mockRole = {
        id: 'role1',
        name: 'test-role',
        is_system: false,
        permissions: [],
        description: null,
        created_at: '',
      };
      const mockPermission = {
        id: 'perm1',
        code: 'test:permission',
        name: 'Test',
        description: null,
        category: 'test',
        created_at: '',
      };
      // role_permission references 'orphaned-perm' which is NOT in the permissions list (perm1)
      const mockOrphanedRolePermission = {
        permission_id: 'orphaned-perm',
        permissions: {
          id: 'orphaned-perm',
          code: 'orphan:perm',
          name: 'Orphaned',
          description: null,
          category: 'test',
          created_at: '',
        },
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          // getAllRoles: from('roles').select('*').order('name')
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockRole],
                error: null,
              }),
            }),
          };
        }
        if (table === 'permissions') {
          // getAllPermissions: from('permissions').select('*').order('code')
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockPermission],
                error: null,
              }),
            }),
          };
        }
        if (table === 'role_permissions') {
          // getRolePermissions: from('role_permissions').select(...).eq('role_id', id)
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [mockOrphanedRolePermission],
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await rbacService.validateRolePermissionIntegrity();

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain('test-role');
    });
  });

  describe('Performance Metrics', () => {
    it('should return performance metrics', async () => {
      const metrics = await rbacService.getPermissionCheckMetrics();

      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('totalChecks');
      expect(metrics).toHaveProperty('cacheSize');

      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });
  });
});
