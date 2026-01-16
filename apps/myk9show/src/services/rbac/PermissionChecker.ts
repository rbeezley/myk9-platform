/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Fix type errors after RBAC database migration (missing RPC functions: user_has_permission, get_user_permissions, get_user_roles, get_effective_permissions)
/**
 * Permission Checker
 *
 * Handles permission checking with caching for RBAC.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  Permission,
  UserRoleWithDetails,
  UserPermissionsResponse,
  PermissionError,
} from '@/types/rbac-types';

export class PermissionChecker {
  private permissionCache = new Map<string, { hasPermission: boolean; expiresAt: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a user has a specific permission
   */
  async checkPermission(
    userId: string,
    permission: string,
    scope?: { type: string; id: string }
  ): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(userId, permission, scope);
      const cached = this.permissionCache.get(cacheKey);

      if (cached && cached.expiresAt > Date.now()) {
        return cached.hasPermission;
      }

      const { data, error } = await supabase.rpc('user_has_permission', {
        user_id: userId,
        permission_name: permission,
        scope_type: scope?.type || undefined,
        scope_id: scope?.id || undefined
      });

      if (error) {
        throw new PermissionError(
          `Failed to check permission: ${error.message}`,
          permission,
          userId,
          scope
        );
      }

      // Cache the result
      this.permissionCache.set(cacheKey, {
        hasPermission: data || false,
        expiresAt: Date.now() + this.cacheTimeout
      });

      return data || false;
    } catch (error) {
      logger.error('Permission check failed:', 'rbac', {}, error as Error);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(
    userId: string,
    scope?: { type: string; id: string }
  ): Promise<UserPermissionsResponse> {
    try {
      // Get detailed permissions
      const { data: permissions, error: permError } = await supabase.rpc('get_user_permissions', {
        user_id: userId,
        filter_scope_type: scope?.type,
        filter_scope_id: scope?.id
      });

      if (permError) {
        throw new Error(`Failed to get user permissions: ${permError.message}`);
      }

      // Get user roles
      const { data: roles, error: rolesError } = await supabase.rpc('get_user_roles', {
        user_id: userId
      });

      if (rolesError) {
        throw new Error(`Failed to get user roles: ${rolesError.message}`);
      }

      // Get effective permissions (with inheritance)
      const { data: effectivePermissions, error: effectiveError } = await supabase.rpc('get_effective_permissions', {
        user_id: userId,
        filter_scope_type: scope?.type || undefined,
        filter_scope_id: scope?.id || undefined
      });

      if (effectiveError) {
        throw new Error(`Failed to get effective permissions: ${effectiveError.message}`);
      }

      // Fetch additional user details for roles
      const roleIds = roles?.map((r: { role_id: string }) => r.role_id) || [];
      const { data: roleDetails } = await supabase
        .from('roles')
        .select('*')
        .in('id', roleIds);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rolesWithDetails: UserRoleWithDetails[] = ((roles || []) as any[]).map((userRole) => ({
        id: `${userId}-${userRole.role_id}`,
        user_id: userId,
        role_id: userRole.role_id,
        scope_type: userRole.scope_type,
        scope_id: userRole.scope_id,
        assigned_by: userRole.assigned_at,
        assigned_at: userRole.assigned_at,
        expires_at: userRole.expires_at,
        is_active: userRole.is_active,
        user_email: '',
        assigned_by_email: '',
        role: roleDetails?.find(r => r.id === userRole.role_id) || {
          id: userRole.role_id,
          name: userRole.role_name,
          display_name: userRole.role_display_name,
          description: '',
          is_active: true,
          is_system: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
          permissions: []
        }
      })) as UserRoleWithDetails[];

      return {
        permissions: permissions || [],
        roles: rolesWithDetails,
        effectivePermissions: effectivePermissions?.map((ep: { permission_name: string }) => ep.permission_name) || []
      };
    } catch (error) {
      logger.error('Failed to get user permissions:', 'rbac', {}, error as Error);
      throw error;
    }
  }

  /**
   * Check permission with organization context
   */
  async checkPermissionWithOrganization(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<boolean> {
    try {
      const hasBasePermission = await this.checkPermission(userId, permission);

      if (!organizationId) {
        return hasBasePermission;
      }

      // TODO: Check for organization-specific overrides when DB function exists
      return hasBasePermission;
    } catch (error) {
      logger.error('Permission check with organization failed:', 'rbac', {}, error as Error);
      return false;
    }
  }

  /**
   * Resolve permission inheritance (e.g., :manage implies CRUD)
   */
  resolvePermissionInheritance(permissions: string[]): string[] {
    const resolvedPermissions = new Set(permissions);

    permissions.forEach(permission => {
      if (permission.endsWith(':manage')) {
        const resource = permission.split(':')[0];
        resolvedPermissions.add(`${resource}:create`);
        resolvedPermissions.add(`${resource}:read`);
        resolvedPermissions.add(`${resource}:update`);
        resolvedPermissions.add(`${resource}:delete`);
      }
    });

    return Array.from(resolvedPermissions);
  }

  /**
   * Get permission inheritance tree for a role
   */
  async getPermissionInheritanceTree(
    roleId: string,
    getRolePermissions: (roleId: string) => Promise<{ permission_id: string; permission: Permission }[]>,
    getAllPermissions: () => Promise<Permission[]>
  ): Promise<{
    direct: Permission[];
    inherited: Permission[];
    implied: Permission[];
  }> {
    try {
      const rolePermissions = await getRolePermissions(roleId);
      const allPermissions = await getAllPermissions();

      const directPermissionIds = rolePermissions.map(rp => rp.permission_id);
      const directPermissions = allPermissions.filter(p => directPermissionIds.includes(p.id));

      // Calculate implied permissions
      const impliedPermissions: Permission[] = [];
      directPermissions.forEach(permission => {
        if (permission.action === 'manage') {
          const baseActions = ['create', 'read', 'update', 'delete'];
          baseActions.forEach(action => {
            impliedPermissions.push({
              id: `implied-${permission.resource}-${action}`,
              name: `${permission.resource}:${action}`,
              display_name: `${permission.resource.charAt(0).toUpperCase() + permission.resource.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
              description: `Implied by ${permission.display_name}`,
              resource: permission.resource,
              action: action,
              is_system: permission.is_system,
              created_at: permission.created_at,
              updated_at: permission.updated_at
            });
          });
        }
      });

      return {
        direct: directPermissions,
        inherited: [],
        implied: impliedPermissions
      };
    } catch (error) {
      logger.error('Failed to get permission inheritance tree:', 'rbac', {}, error as Error);
      throw error;
    }
  }

  // Cache management
  private getCacheKey(
    userId: string,
    permission: string,
    scope?: { type: string; id: string }
  ): string {
    const scopeKey = scope ? `${scope.type}:${scope.id}` : 'global';
    return `${userId}:${permission}:${scopeKey}`;
  }

  clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.permissionCache.delete(key));
  }

  clearAllCache(): void {
    this.permissionCache.clear();
  }

  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }

  getCacheSize(): number {
    return this.permissionCache.size;
  }
}
