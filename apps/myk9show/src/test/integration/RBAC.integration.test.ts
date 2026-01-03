/**
 * RBAC Integration Tests
 * Phase 5: Testing - Integration tests for database operations
 * Created: December 2024
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rbacService } from '@/services/rbac/RBACService';
import { ActionType } from '@/types/rbac-types';

// Test database configuration
// Note: These tests require a test Supabase instance or proper test database setup
const SUPABASE_TEST_URL = process.env.VITE_SUPABASE_TEST_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_TEST_ANON_KEY = process.env.VITE_SUPABASE_TEST_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Skip integration tests if no test database is configured
const skipIntegration = !SUPABASE_TEST_URL || !SUPABASE_TEST_ANON_KEY;

const testSupabase = createClient(SUPABASE_TEST_URL!, SUPABASE_TEST_ANON_KEY!);

describe.skipIf(skipIntegration)('RBAC Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testRoleId = 'test-role-456';
  const testPermissionId = 'test-permission-789';
  
  beforeAll(async () => {
    // Set up test data
    console.log('Setting up RBAC integration test data...');
    
    // Create test user (mock auth user)
    await testSupabase.auth.signInAnonymously();
    
    // Clean up any existing test data
    await cleanupTestData();
    
    // Create test permission
    await testSupabase
      .from('permissions')
      .insert({
        id: testPermissionId,
        name: 'test:permission',
        display_name: 'Test Permission',
        description: 'A test permission for integration tests',
        resource: 'test',
        action: 'permission',
        is_system: false
      });
    
    // Create test role
    await testSupabase
      .from('roles')
      .insert({
        id: testRoleId,
        name: 'test-role',
        display_name: 'Test Role',
        description: 'A test role for integration tests',
        is_system: false,
        is_active: true
      });
  });
  
  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await testSupabase.auth.signOut();
  });
  
  beforeEach(() => {
    // Clear cache before each test
    rbacService.clearAllCache();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  async function cleanupTestData() {
    // Delete in correct order to avoid foreign key constraints
    await testSupabase.from('user_roles').delete().eq('user_id', testUserId);
    await testSupabase.from('role_permissions').delete().eq('role_id', testRoleId);
    await testSupabase.from('permission_audit_log').delete().eq('actor_id', testUserId);
    await testSupabase.from('roles').delete().eq('id', testRoleId);
    await testSupabase.from('permissions').delete().eq('id', testPermissionId);
  }
  
  describe('Database Schema Validation', () => {
    it('should have all required RBAC tables', async () => {
      const { data: tables, error } = await testSupabase.rpc('get_rbac_tables');
      
      if (error && error.message.includes('function get_rbac_tables() does not exist')) {
        // If the function doesn't exist, check tables manually
        const expectedTables = [
          'roles',
          'permissions', 
          'role_permissions',
          'user_roles',
          'permission_audit_log'
        ];
        
        for (const table of expectedTables) {
          const { error: tableError } = await testSupabase.from(table).select('id').limit(1);
          expect(tableError).toBeNull();
        }
      } else {
        expect(error).toBeNull();
        expect(tables).toBeDefined();
      }
    });
    
    it('should have proper RLS policies', async () => {
      // Test that we can't access data without proper authentication
      const unauthenticatedClient = createClient(SUPABASE_TEST_URL!, SUPABASE_TEST_ANON_KEY!);
      
      const { data, error } = await unauthenticatedClient
        .from('roles')
        .select('*');
      
      // Should either return empty data or require authentication
      // This depends on your RLS policy configuration
      expect(error?.message?.includes('permission denied') || data?.length === 0).toBeTruthy();
    });
  });
  
  describe('Role Management Operations', () => {
    it('should create, read, update, and delete roles', async () => {
      // Create role
      const newRole = await rbacService.createRole({
        name: 'integration-test-role',
        displayName: 'Integration Test Role',
        description: 'Created during integration testing',
        permissions: ['test:permission']
      });
      
      expect(newRole.name).toBe('integration-test-role');
      expect(newRole.display_name).toBe('Integration Test Role');
      
      // Read role
      const fetchedRole = await rbacService.getRole(newRole.id);
      expect(fetchedRole.id).toBe(newRole.id);
      expect(fetchedRole.name).toBe('integration-test-role');
      
      // Update role
      const updatedRole = await rbacService.updateRole(newRole.id, {
        displayName: 'Updated Test Role',
        description: 'Updated during integration testing'
      });
      
      expect(updatedRole.display_name).toBe('Updated Test Role');
      expect(updatedRole.description).toBe('Updated during integration testing');
      
      // Delete role
      const deleteResult = await rbacService.deleteRole(newRole.id);
      expect(deleteResult).toBe(true);
      
      // Verify deletion
      await expect(rbacService.getRole(newRole.id)).rejects.toThrow();
    });
    
    it('should handle role permissions correctly', async () => {
      // Assign permission to test role
      await testSupabase
        .from('role_permissions')
        .insert({
          role_id: testRoleId,
          permission_id: testPermissionId
        });
      
      // Get role with permissions
      const roleWithPermissions = await rbacService.getRoleWithPermissions(testRoleId);
      
      expect(roleWithPermissions.permissions).toBeDefined();
      expect(roleWithPermissions.permissions.length).toBeGreaterThan(0);
      expect(roleWithPermissions.permissions[0].name).toBe('test:permission');
      
      // Update role permissions
      await rbacService.updateRolePermissions(testRoleId, [testPermissionId]);
      
      const updatedPermissions = await rbacService.getRolePermissions(testRoleId);
      expect(updatedPermissions.length).toBe(1);
      expect(updatedPermissions[0].permission_id).toBe(testPermissionId);
    });
  });
  
  describe('User Role Assignment', () => {
    it('should assign and revoke user roles', async () => {
      // Assign role to user
      const assignmentId = await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role'
      });
      
      expect(assignmentId).toBeDefined();
      
      // Verify assignment exists
      const { data: userRoles } = await testSupabase
        .from('user_roles')
        .select('*')
        .eq('user_id', testUserId)
        .eq('role_id', testRoleId);
      
      expect(userRoles?.length).toBe(1);
      
      // Revoke role from user
      const revokeResult = await rbacService.revokeRole({
        userId: testUserId,
        roleName: 'test-role'
      });
      
      expect(revokeResult).toBe(true);
      
      // Verify revocation
      const { data: remainingRoles } = await testSupabase
        .from('user_roles')
        .select('*')
        .eq('user_id', testUserId)
        .eq('role_id', testRoleId);
      
      expect(remainingRoles?.length).toBe(0);
    });
    
    it('should handle scoped role assignments', async () => {
      // Assign role with club scope
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role',
        scopeType: 'club',
        scopeId: 'test-club-123'
      });
      
      // Verify scoped assignment
      const { data: scopedRoles } = await testSupabase
        .from('user_roles')
        .select('*')
        .eq('user_id', testUserId)
        .eq('scope_type', 'club')
        .eq('scope_id', 'test-club-123');
      
      expect(scopedRoles?.length).toBe(1);
      
      // Clean up
      await rbacService.revokeRole({
        userId: testUserId,
        roleName: 'test-role',
        scopeType: 'club',
        scopeId: 'test-club-123'
      });
    });
    
    it('should handle role expiration', async () => {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7); // 7 days from now
      
      // Assign role with expiration
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role',
        expiresAt: expirationDate.toISOString()
      });
      
      // Verify expiration is set
      const { data: expiredRoles } = await testSupabase
        .from('user_roles')
        .select('*')
        .eq('user_id', testUserId)
        .not('expires_at', 'is', null);
      
      expect(expiredRoles?.length).toBe(1);
      expect(new Date(expiredRoles![0].expires_at!)).toEqual(expirationDate);
      
      // Clean up
      await rbacService.revokeRole({
        userId: testUserId,
        roleName: 'test-role'
      });
    });
  });
  
  describe('Permission Checking', () => {
    beforeEach(async () => {
      // Set up test data for permission checking
      await testSupabase
        .from('role_permissions')
        .insert({
          role_id: testRoleId,
          permission_id: testPermissionId
        });
      
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role'
      });
    });
    
    afterEach(async () => {
      // Clean up test data
      await testSupabase.from('user_roles').delete().eq('user_id', testUserId);
      await testSupabase.from('role_permissions').delete().eq('role_id', testRoleId);
    });
    
    it('should check permissions correctly', async () => {
      // Test positive permission check
      const hasPermission = await rbacService.checkPermission(testUserId, 'test:permission');
      expect(hasPermission).toBe(true);
      
      // Test negative permission check
      const lacksPermission = await rbacService.checkPermission(testUserId, 'nonexistent:permission');
      expect(lacksPermission).toBe(false);
    });
    
    it('should handle scoped permission checks', async () => {
      // Assign scoped role
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role',
        scopeType: 'club',
        scopeId: 'test-club-123'
      });
      
      // Check permission with matching scope
      const hasPermissionInScope = await rbacService.checkPermission(
        testUserId, 
        'test:permission',
        { type: 'club', id: 'test-club-123' }
      );
      expect(hasPermissionInScope).toBe(true);
      
      // Check permission with non-matching scope
      const lacksPermissionOutOfScope = await rbacService.checkPermission(
        testUserId,
        'test:permission',
        { type: 'club', id: 'different-club-456' }
      );
      expect(lacksPermissionOutOfScope).toBe(false);
    });
    
    it('should cache permission checks', async () => {
      // First check - should hit database
      const start1 = Date.now();
      const result1 = await rbacService.checkPermission(testUserId, 'test:permission');
      const time1 = Date.now() - start1;
      
      expect(result1).toBe(true);
      
      // Second check - should use cache
      const start2 = Date.now();
      const result2 = await rbacService.checkPermission(testUserId, 'test:permission');
      const time2 = Date.now() - start2;
      
      expect(result2).toBe(true);
      expect(time2).toBeLessThan(time1); // Cache should be faster
    });
  });
  
  describe('Audit Logging', () => {
    it('should log role assignments in audit trail', async () => {
      // Perform an operation that should be audited
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role'
      });
      
      // Check audit log
      const auditResult = await rbacService.getAuditLog({
        userId: testUserId,
        actionType: ActionType.ROLE_ASSIGNED,
        page: 1,
        pageSize: 10
      });
      
      expect(auditResult.entries.length).toBeGreaterThan(0);
      expect(auditResult.entries[0].action_type).toBe(ActionType.ROLE_ASSIGNED);
      expect(auditResult.entries[0].target_user_id).toBe(testUserId);
      
      // Clean up
      await rbacService.revokeRole({
        userId: testUserId,
        roleName: 'test-role'
      });
    });
    
    it('should log role creation and deletion', async () => {
      // Create role (should be audited)
      const newRole = await rbacService.createRole({
        name: 'audit-test-role',
        displayName: 'Audit Test Role',
        permissions: []
      });
      
      // Check creation audit
      let auditResult = await rbacService.getAuditLog({
        actionType: ActionType.ROLE_CREATED,
        page: 1,
        pageSize: 10
      });
      
      const creationEntry = auditResult.entries.find(e => e.target_role_id === newRole.id);
      expect(creationEntry).toBeDefined();
      expect(creationEntry!.action_type).toBe(ActionType.ROLE_CREATED);
      
      // Delete role (should be audited)
      await rbacService.deleteRole(newRole.id);
      
      // Check deletion audit
      auditResult = await rbacService.getAuditLog({
        actionType: ActionType.ROLE_DELETED,
        page: 1,
        pageSize: 10
      });
      
      const deletionEntry = auditResult.entries.find(e => e.target_role_id === newRole.id);
      expect(deletionEntry).toBeDefined();
      expect(deletionEntry!.action_type).toBe(ActionType.ROLE_DELETED);
    });
  });
  
  describe('Data Integrity', () => {
    it('should validate role permission integrity', async () => {
      const integrityResult = await rbacService.validateRolePermissionIntegrity();
      
      expect(integrityResult).toBeDefined();
      expect(typeof integrityResult.isValid).toBe('boolean');
      expect(Array.isArray(integrityResult.issues)).toBe(true);
      
      // In a clean test environment, there should be no integrity issues
      if (integrityResult.issues.length > 0) {
        console.warn('Integrity issues found:', integrityResult.issues);
      }
    });
    
    it('should handle foreign key constraints properly', async () => {
      // Try to create role permission with non-existent role
      await expect(
        testSupabase
          .from('role_permissions')
          .insert({
            role_id: 'non-existent-role',
            permission_id: testPermissionId
          })
      ).rejects.toThrow();
      
      // Try to create role permission with non-existent permission
      await expect(
        testSupabase
          .from('role_permissions')
          .insert({
            role_id: testRoleId,
            permission_id: 'non-existent-permission'
          })
      ).rejects.toThrow();
    });
  });
  
  describe('Performance', () => {
    it('should handle multiple concurrent permission checks', async () => {
      // Set up test role and permission
      await testSupabase
        .from('role_permissions')
        .insert({
          role_id: testRoleId,
          permission_id: testPermissionId
        });
      
      await rbacService.assignRole({
        userId: testUserId,
        roleName: 'test-role'
      });
      
      // Perform multiple concurrent permission checks
      const promises = Array.from({ length: 10 }, () =>
        rbacService.checkPermission(testUserId, 'test:permission')
      );
      
      const start = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      // All checks should return true
      expect(results.every(result => result === true)).toBe(true);
      
      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      console.log(`10 concurrent permission checks completed in ${duration}ms`);
      
      // Clean up
      await testSupabase.from('user_roles').delete().eq('user_id', testUserId);
      await testSupabase.from('role_permissions').delete().eq('role_id', testRoleId);
    });
    
    it('should provide performance metrics', async () => {
      const metrics = await rbacService.getPermissionCheckMetrics();
      
      expect(metrics).toBeDefined();
      expect(typeof metrics.cacheHitRate).toBe('number');
      expect(typeof metrics.averageResponseTime).toBe('number');
      expect(typeof metrics.totalChecks).toBe('number');
      expect(typeof metrics.cacheSize).toBe('number');
      
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });
  });
});
