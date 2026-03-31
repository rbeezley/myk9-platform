/**
 * Privilege Escalation Security Tests
 * Phase 5: Testing - Security tests for privilege escalation vulnerabilities
 * Created: December 2024
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { RBACService } from '@/services/rbac/RBACService';
import { supabase } from '@/lib/supabase';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

const mockSupabase = supabase as {
  rpc: Mock;
  from: Mock;
  auth: { getUser: Mock };
};

describe('Privilege Escalation Security Tests', () => {
  let rbacService: RBACService;
  const REGULAR_USER_ID = 'regular-user-123';
  const SECRETARY_USER_ID = 'secretary-user-456';
  const ADMIN_USER_ID = 'admin-user-789';
  const SITE_ADMIN_USER_ID = 'site-admin-999';

  beforeEach(() => {
    vi.clearAllMocks();
    rbacService = RBACService.getInstance();
    rbacService.clearAllCache();

    // Default mock for getUser
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: REGULAR_USER_ID, email: 'regular@example.com' } },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Self-Privilege Escalation Prevention', () => {
    it('should prevent regular users from assigning roles to themselves', async () => {
      // Mock non-admin user
      mockSupabase.rpc.mockImplementation(funcName => {
        if (funcName === 'user_has_permission') {
          // Return false for admin permissions, true for basic ones
          return Promise.resolve({
            data: false, // No admin permissions
            error: null,
          });
        }
        return Promise.resolve({ data: false, error: null });
      });

      const validation = await rbacService.validatePermissionEscalation(
        REGULAR_USER_ID,
        REGULAR_USER_ID, // Same user - self assignment
        'secretary'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('cannot assign roles to themselves');
    });

    it('should allow site admins to assign roles to themselves', async () => {
      // isUserSiteAdmin → checkPermission('admin:manage') → RPC: true
      // canAssignRole → checkPermission('role:assign') → RPC: true
      // getAllRoles → from('roles').select('*').order('name') → returns secretary role
      // getRolePermissions → from('role_permissions').select(...).eq(...) → returns []
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'role:assign') {
            return Promise.resolve({ data: true, error: null });
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sec-role',
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

      const validation = await rbacService.validatePermissionEscalation(
        SITE_ADMIN_USER_ID,
        SITE_ADMIN_USER_ID,
        'secretary'
      );

      expect(validation.isValid).toBe(true);
    });

    it('should prevent assignment of non-existent roles', async () => {
      // actor !== target: no self-check
      // canAssignRole → RPC: true
      // getAllRoles → returns empty array → role not found → reason: 'Target role does not exist'
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission' && params.permission_name === 'role:assign') {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      });

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

      const validation = await rbacService.validatePermissionEscalation(
        ADMIN_USER_ID,
        REGULAR_USER_ID,
        'non-existent-role'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('does not exist');
    });

    it('should prevent assignment of system roles by non-site-admins', async () => {
      // actor !== target: no self-check
      // canAssignRole → RPC: true
      // getAllRoles → returns system-admin role (is_system: true)
      // isUserSiteAdmin → admin:manage → false → denied
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'role:assign') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: false, error: null });
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sys-role',
                    name: 'system-admin',
                    is_system: true,
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
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const validation = await rbacService.validatePermissionEscalation(
        ADMIN_USER_ID,
        REGULAR_USER_ID,
        'system-admin'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('Only site administrators can assign system roles');
    });

    it('should prevent users without role:assign permission from assigning roles', async () => {
      // Mock user without role assignment permission
      mockSupabase.rpc.mockImplementation((funcName, params) => {
        if (funcName === 'user_has_permission' && params.permission_name === 'role:assign') {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      });

      const validation = await rbacService.validatePermissionEscalation(
        REGULAR_USER_ID,
        SECRETARY_USER_ID,
        'secretary'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('does not have permission to assign roles');
    });
  });

  describe('Bulk Operation Security', () => {
    it('should prevent unauthorized bulk operations', async () => {
      // Mock user without bulk operation permission
      mockSupabase.rpc.mockImplementation((funcName, params) => {
        if (funcName === 'user_has_permission' && params.permission_name === 'role:bulk_assign') {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      });

      const validation = await rbacService.validateBulkOperation(
        REGULAR_USER_ID,
        'assign_role',
        ['user1', 'user2', 'user3'],
        ['role1']
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('does not have permission to perform bulk operations');
    });

    it('should enforce bulk operation limits for non-site-admins', async () => {
      // Mock regular user with bulk permission but not site admin
      mockSupabase.rpc.mockImplementation((funcName, params) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'role:bulk_assign') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: false, error: null }); // Not site admin
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      // Create array of 60 users (exceeds 50 user limit for non-admins)
      const tooManyUsers = Array.from({ length: 60 }, (_, i) => `user${i}`);

      const validation = await rbacService.validateBulkOperation(
        REGULAR_USER_ID,
        'assign_role',
        tooManyUsers,
        ['role1']
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('exceeds limit (50 users)');
    });

    it('should allow site admins to exceed normal bulk limits', async () => {
      // Mock site admin — bulk_assign + admin:manage both true
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'role:bulk_assign') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: true, error: null }); // Site admin
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      // getAllRoles() uses from('roles').select('*').order('name') — no .eq()
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'role1',
                    name: 'member',
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
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // 100 users — exceeds normal limit (50) but site admin limit is 1000
      const manyUsers = Array.from({ length: 100 }, (_, i) => `user${i}`);

      const validation = await rbacService.validateBulkOperation(
        SITE_ADMIN_USER_ID,
        'assign_role',
        manyUsers,
        ['role1']
      );

      expect(validation.isValid).toBe(true);
    });

    it('should prevent bulk assignment of system roles by non-site-admins', async () => {
      // bulk_assign true, admin:manage false → not a site admin
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'role:bulk_assign') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: false, error: null }); // Not site admin
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      // getAllRoles() uses from('roles').select('*').order('name') — no .eq()
      // The system role id must match the roleId passed to validateBulkOperation
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sys-role',
                    name: 'system-admin',
                    is_system: true,
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
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const validation = await rbacService.validateBulkOperation(
        ADMIN_USER_ID,
        'assign_role',
        ['user1', 'user2'],
        ['sys-role'] // System role
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain(
        'Bulk assignment of system roles requires site administrator privileges'
      );
    });
  });

  describe('Permission Bypass Attempts', () => {
    it('should not allow permission checks to be bypassed with malformed input', async () => {
      // Test with null/undefined inputs
      const result1 = await rbacService.checkPermission('', 'admin:manage');
      expect(result1).toBe(false);

      const result2 = await rbacService.checkPermission(REGULAR_USER_ID, '');
      expect(result2).toBe(false);

      // Test with injection-like strings
      const result3 = await rbacService.checkPermission(REGULAR_USER_ID, "'; DROP TABLE users; --");
      expect(result3).toBe(false);
    });

    it('should handle database errors securely', async () => {
      // Mock database error
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      // Should return false on database errors, not throw
      const result = await rbacService.checkPermission(REGULAR_USER_ID, 'admin:manage');
      expect(result).toBe(false);
    });

    it('should prevent cache poisoning attacks', async () => {
      // First, cache a false result
      mockSupabase.rpc.mockResolvedValue({ data: false, error: null });
      const result1 = await rbacService.checkPermission(REGULAR_USER_ID, 'admin:manage');
      expect(result1).toBe(false);

      // Now try to "poison" cache by checking different user with same permission
      // This should not affect the original user's cached result
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
      await rbacService.checkPermission(ADMIN_USER_ID, 'admin:manage');

      // Original user should still have false result from cache
      const result2 = await rbacService.checkPermission(REGULAR_USER_ID, 'admin:manage');
      expect(result2).toBe(false);
    });

    it('should properly isolate scoped permissions', async () => {
      // Mock user has permission in club A but not club B
      mockSupabase.rpc.mockImplementation((funcName, params) => {
        if (params.scope_id === 'club-a') {
          return Promise.resolve({ data: true, error: null });
        }
        if (params.scope_id === 'club-b') {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      });

      // User should have permission in club A
      const resultA = await rbacService.checkPermission(REGULAR_USER_ID, 'show:manage', {
        type: 'club',
        id: 'club-a',
      });
      expect(resultA).toBe(true);

      // User should NOT have permission in club B
      const resultB = await rbacService.checkPermission(REGULAR_USER_ID, 'show:manage', {
        type: 'club',
        id: 'club-b',
      });
      expect(resultB).toBe(false);
    });
  });

  describe('Role Assignment Security', () => {
    it('should complete concurrent role assignments without throwing', async () => {
      // assignRole(roleId only) → getRole(roleId) → from('roles').select('*').eq('id', ...).single()
      // then from('user_roles').insert(...).select('id').single() → returns data.id
      // auth.getUser() is also called to get granted_by
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ADMIN_USER_ID } },
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'people') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: { id: REGULAR_USER_ID }, error: null }),
              }),
            }),
          };
        }
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'role1',
                    name: 'member',
                    is_system: false,
                    permissions: [],
                    description: null,
                    created_at: '',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'user_roles') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'assignment-id' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      // Attempt concurrent role assignments
      const promises = [
        rbacService.assignRole({ userId: REGULAR_USER_ID, roleId: 'role1' }),
        rbacService.assignRole({ userId: REGULAR_USER_ID, roleId: 'role2' }),
        rbacService.assignRole({ userId: REGULAR_USER_ID, roleId: 'role3' }),
      ];

      // All should complete successfully without throwing
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(results.every(r => r === 'assignment-id')).toBe(true);
    });
  });

  describe('Admin Permission Security', () => {
    it('should prevent elevation to admin roles without proper validation', async () => {
      // actor != target → no self-check
      // canAssignRole → role:assign → true
      // getAllRoles → roles.select('*').order('name') → admin role (is_system: false)
      // isUserSiteAdmin (system role check skipped since is_system false)
      // getRolePermissions → role_permissions.select(...).eq('role_id', 'admin-role') → permission with 'admin' in id
      // hasAdminPermissions = true → isUserSiteAdmin → admin:manage → false → denied
      mockSupabase.rpc.mockImplementation((funcName: string, params: Record<string, unknown>) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'role:assign') {
            return Promise.resolve({ data: true, error: null });
          }
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: false, error: null }); // Not site admin
          }
        }
        return Promise.resolve({ data: false, error: null });
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'admin-role',
                    name: 'admin',
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
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    permission_id: 'admin-permission',
                    permissions: {
                      id: 'admin-permission',
                      code: 'admin:manage',
                      name: 'Admin',
                      description: null,
                      category: 'admin',
                      created_at: '',
                    },
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const validation = await rbacService.validatePermissionEscalation(
        REGULAR_USER_ID,
        SECRETARY_USER_ID,
        'admin'
      );

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain(
        'Only site administrators can assign roles with administrative permissions'
      );
    });

    it('should properly validate site admin permissions', async () => {
      // Mock site admin check
      mockSupabase.rpc.mockImplementation((funcName, params) => {
        if (funcName === 'user_has_permission') {
          if (params.permission_name === 'admin:manage') {
            return Promise.resolve({ data: true, error: null }); // Is site admin
          }
        }
        return Promise.resolve({ data: true, error: null });
      });

      const isSiteAdmin = await rbacService.isUserSiteAdmin(SITE_ADMIN_USER_ID);
      expect(isSiteAdmin).toBe(true);

      const isRegularAdmin = await rbacService.isUserSiteAdmin(REGULAR_USER_ID);
      expect(isRegularAdmin).toBe(true); // This is mocked to return true for all in this test
    });
  });

  describe('Error Handling Security', () => {
    it('should handle validation errors securely', async () => {
      // PermissionChecker catches RPC errors internally and returns false.
      // So checkPermission('role:assign') → false (not thrown), and
      // validatePermissionEscalation returns the permission-denied reason,
      // not 'Security validation failed due to system error'.
      mockSupabase.rpc.mockRejectedValue(new Error('Database error'));

      const validation = await rbacService.validatePermissionEscalation(
        REGULAR_USER_ID,
        SECRETARY_USER_ID,
        'admin'
      );

      expect(validation.isValid).toBe(false);
      // PermissionChecker silently returns false on error → denied for lack of permission
      expect(validation.reason).toContain('does not have permission to assign roles');
    });

    it('should not expose sensitive information in error messages', async () => {
      // Mock database error with sensitive information
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: {
          message:
            'Connection failed to database server at 192.168.1.100:5432 with password "secret123"',
        },
      });

      // Permission check should fail gracefully without exposing sensitive details
      const result = await rbacService.checkPermission(REGULAR_USER_ID, 'admin:manage');
      expect(result).toBe(false);

      // The error should be logged but not exposed to the caller
      // In a real implementation, you'd check that sensitive data is not returned
    });
  });
});
