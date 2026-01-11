/**
 * Role Manager
 *
 * Handles role CRUD operations and role assignments.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  Role,
  Permission,
  UserRole,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleError,
  ActionType,
} from '@/types/rbac-types';
import type { AuditLogger } from './AuditLogger';

export class RoleManager {
  constructor(
    private auditLogger: AuditLogger,
    private clearUserCache: (userId: string) => void,
    private clearAllCache: () => void
  ) {}

  /**
   * Assign a role to a user
   */
  async assignRole(request: AssignRoleRequest): Promise<string> {
    try {
      let roleName = request.roleName;
      if (!roleName && request.roleId) {
        const role = await this.getRole(request.roleId);
        roleName = role.name;
      }

      if (!roleName) {
        throw new Error('Either roleName or roleId must be provided');
      }

      const { data, error } = await supabase.rpc('assign_user_role', {
        target_user_id: request.userId,
        role_name: roleName,
        scope_type: request.scopeType || undefined,
        scope_id: request.scopeId || undefined,
        expires_at: request.expiresAt || undefined,
        assigned_by_user_id: (await supabase.auth.getUser()).data.user?.id || undefined
      });

      if (error) {
        throw new RoleError(
          `Failed to assign role: ${error.message}`,
          roleName || 'unknown',
          request.userId
        );
      }

      this.clearUserCache(request.userId);
      return data;
    } catch (error) {
      logger.error('Role assignment failed', 'rbac', { userId: request.userId, roleName: request.roleName }, error as Error);
      throw error;
    }
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(request: RevokeRoleRequest): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('revoke_user_role', {
        target_user_id: request.userId,
        role_name: request.roleName,
        scope_type: request.scopeType || undefined,
        scope_id: request.scopeId || undefined,
        revoked_by_user_id: (await supabase.auth.getUser()).data.user?.id || undefined
      });

      if (error) {
        throw new RoleError(
          `Failed to revoke role: ${error.message}`,
          request.roleName,
          request.userId
        );
      }

      this.clearUserCache(request.userId);
      return data || false;
    } catch (error) {
      logger.error('Role revocation failed', 'rbac', { userId: request.userId, roleName: request.roleName }, error as Error);
      throw error;
    }
  }

  /**
   * Create a new role
   */
  async createRole(request: CreateRoleRequest): Promise<Role> {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .insert({
          name: request.name,
          display_name: request.displayName,
          description: request.description,
          is_system: false,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (roleError) {
        throw new Error(`Failed to create role: ${roleError.message}`);
      }

      // Assign permissions to the role
      if (request.permissions.length > 0) {
        const { data: permissions } = await supabase
          .from('permission')
          .select('id, name')
          .in('name', request.permissions);

        if (permissions && permissions.length > 0) {
          const user = (await supabase.auth.getUser()).data.user;
          const rolePermissions = permissions.map(p => ({
            role_id: roleData.id,
            permission_id: p.id,
            granted_by: user?.id
          }));

          await supabase
            .from('role_permission')
            .insert(rolePermissions);
        }
      }

      await this.auditLogger.logAuditEvent(ActionType.ROLE_CREATED, {
        target_role_id: roleData.id,
        details: {
          role_name: request.name,
          permissions_count: request.permissions.length
        }
      });

      return roleData as Role;
    } catch (error) {
      logger.error('Role creation failed', 'rbac', { roleName: request.name }, error as Error);
      throw error;
    }
  }

  /**
   * Update an existing role
   */
  async updateRole(roleId: string, request: UpdateRoleRequest): Promise<Role> {
    try {
      const updateData: Partial<Role> = {
        updated_by: (await supabase.auth.getUser()).data.user?.id,
        updated_at: new Date().toISOString()
      };

      if (request.displayName !== undefined) {
        updateData.display_name = request.displayName;
      }
      if (request.description !== undefined) {
        updateData.description = request.description;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .update(updateData)
        .eq('id', roleId)
        .select()
        .single();

      if (roleError) {
        throw new Error(`Failed to update role: ${roleError.message}`);
      }

      // Update permissions if provided
      if (request.permissions !== undefined) {
        await supabase
          .from('role_permission')
          .delete()
          .eq('role_id', roleId);

        if (request.permissions.length > 0) {
          const { data: permissions } = await supabase
            .from('permission')
            .select('id, name')
            .in('name', request.permissions);

          if (permissions && permissions.length > 0) {
            const user = (await supabase.auth.getUser()).data.user;
            const rolePermissions = permissions.map(p => ({
              role_id: roleId,
              permission_id: p.id,
              granted_by: user?.id
            }));

            await supabase
              .from('role_permission')
              .insert(rolePermissions);
          }
        }
      }

      await this.auditLogger.logAuditEvent(ActionType.ROLE_UPDATED, {
        target_role_id: roleId,
        details: request as Record<string, unknown>
      });

      this.clearAllCache();
      return roleData as Role;
    } catch (error) {
      logger.error('Role update failed', 'rbac', { roleId }, error as Error);
      throw error;
    }
  }

  /**
   * Delete a role (non-system roles only)
   */
  async deleteRole(roleId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('role')
        .delete()
        .eq('id', roleId)
        .eq('is_system', false);

      if (error) {
        throw new Error(`Failed to delete role: ${error.message}`);
      }

      await this.auditLogger.logAuditEvent(ActionType.ROLE_DELETED, {
        target_role_id: roleId
      });

      this.clearAllCache();
      return true;
    } catch (error) {
      logger.error('Role deletion failed', 'rbac', { roleId }, error as Error);
      throw error;
    }
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<Role[]> {
    const { data, error } = await supabase
      .from('role')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error(`Failed to get roles: ${error.message}`);
    }

    return (data || []) as Role[];
  }

  /**
   * Get all permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permission')
      .select('*')
      .order('resource, action');

    if (error) {
      throw new Error(`Failed to get permissions: ${error.message}`);
    }

    return (data || []) as Permission[];
  }

  /**
   * Get a single role by ID
   */
  async getRole(roleId: string): Promise<Role> {
    const { data, error } = await supabase
      .from('role')
      .select('*')
      .eq('id', roleId)
      .single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    return data as Role;
  }

  /**
   * Get role with its permissions
   */
  async getRoleWithPermissions(roleId: string): Promise<Role & { permissions: Permission[] }> {
    const { data, error } = await supabase
      .from('role')
      .select(`
        *,
        role_permission (
          permission (*)
        )
      `)
      .eq('id', roleId)
      .single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    return {
      ...data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permissions: (data.role_permission || []).map((rp: any) => rp.permission).filter(Boolean) as Permission[]
    } as Role & { permissions: Permission[] };
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(roleId: string): Promise<{ permission_id: string; permission: Permission }[]> {
    const { data, error } = await supabase
      .from('role_permission')
      .select(`
        permission_id,
        permission!inner (
          id,
          name,
          display_name,
          description,
          resource,
          action,
          is_system,
          created_at,
          updated_at
        )
      `)
      .eq('role_id', roleId);

    if (error) {
      throw new Error(`Failed to get role permissions: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any) => ({
      permission_id: item.permission_id || '',
      permission: Array.isArray(item.permission) ? item.permission[0] as unknown as Permission : item.permission as unknown as Permission
    }));
  }

  /**
   * Update permissions for a role
   */
  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    try {
      await supabase
        .from('role_permission')
        .delete()
        .eq('role_id', roleId);

      if (permissionIds.length > 0) {
        const user = (await supabase.auth.getUser()).data.user;
        const rolePermissions = permissionIds.map(permissionId => ({
          role_id: roleId,
          permission_id: permissionId,
          granted_by: user?.id || null,
          granted_at: new Date().toISOString()
        }));

        await supabase
          .from('role_permission')
          .insert(rolePermissions);
      }

      this.clearAllCache();
    } catch (error) {
      logger.error('Failed to update role permissions', 'rbac', { roleId, permissionCount: permissionIds.length }, error as Error);
      throw error;
    }
  }

  /**
   * Get all user role assignments
   */
  async getAllUserRoles(): Promise<UserRole[]> {
    const { data, error } = await supabase
      .from('user_role')
      .select(`
        *,
        role:role(*),
        assigned_by_user:assigned_by(email)
      `)
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user roles: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any) => ({
      ...item,
      user_email: 'Unknown User',
      assigned_by_email: 'System'
    })) as UserRole[];
  }

  /**
   * Revoke a user role by ID
   */
  async revokeUserRole(userRoleId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_role')
        .update({ is_active: false })
        .eq('id', userRoleId);

      if (error) {
        throw new Error(`Failed to revoke user role: ${error.message}`);
      }

      const userRole = await supabase
        .from('user_role')
        .select('user_id')
        .eq('id', userRoleId)
        .single();

      if (userRole.data) {
        this.clearUserCache(userRole.data.user_id || '');
      }
    } catch (error) {
      logger.error('Failed to revoke user role', 'rbac', { userRoleId }, error as Error);
      throw error;
    }
  }

  /**
   * Migrate user roles from legacy system
   */
  async migrateUserRoles(userId: string, roles: string[]): Promise<void> {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .select('id, name')
        .in('name', roles);

      if (roleError) {
        throw new Error(`Failed to get role data: ${roleError.message}`);
      }

      if (!roleData || roleData.length === 0) {
        return;
      }

      const userRoles = roleData.map(role => ({
        user_id: userId,
        role_id: role.id,
        is_active: true,
        created_at: new Date().toISOString(),
        assigned_by: userId
      }));

      const { error: insertError } = await supabase
        .from('user_role')
        .insert(userRoles);

      if (insertError) {
        throw new Error(`Failed to migrate user roles: ${insertError.message}`);
      }

      this.clearUserCache(userId);

      await this.auditLogger.logAuditEvent(ActionType.ROLE_ASSIGNED, {
        target_user_id: userId,
        details: { migrated_roles: roles }
      });
    } catch (error) {
      logger.error('User role migration failed', 'rbac', { userId, roles }, error as Error);
      throw error;
    }
  }

  /**
   * Check if user has been migrated to new RBAC system
   */
  async checkUserMigration(userId: string): Promise<{
    isMigrated: boolean;
    needsMigration: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_role')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        throw new Error(`Failed to check migration status: ${error.message}`);
      }

      const isMigrated = data && data.length > 0;
      return {
        isMigrated,
        needsMigration: !isMigrated
      };
    } catch (error) {
      logger.error('Migration check failed', 'rbac', { userId }, error as Error);
      return {
        isMigrated: false,
        needsMigration: false
      };
    }
  }
}
