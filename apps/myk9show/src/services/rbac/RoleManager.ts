/**
 * Role Manager
 *
 * Handles role CRUD operations and role assignments.
 * Uses direct table operations (no RPC functions for role management).
 *
 * DB tables used:
 *   roles: id, name, description, is_system, permissions (string[]), created_at
 *   user_roles: id, user_id, role_id, club_id, show_id, granted_by, granted_at, expires_at
 *   role_permissions: id, role_id, permission_id, created_at
 *   permissions: id, code, name, description, category, created_at
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import type { Database } from '@/types/supabase';
import {
  Role,
  Permission,
  UserRole,
  RoleWithPermissions,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleError,
  ActionType,
} from '@/types/rbac-types';
import type { AuditLogger } from './AuditLogger';

// DB row types derived from Supabase schema
type RolesRow = Database['public']['Tables']['roles']['Row'];
type PermissionsRow = Database['public']['Tables']['permissions']['Row'];
type UserRolesRow = Database['public']['Tables']['user_roles']['Row'];

// Join result shapes for nested Supabase queries
interface RoleWithJoinedPermissions extends RolesRow {
  role_permissions: Array<{ permissions: PermissionsRow }>;
}

interface RolePermissionJoinRow {
  permission_id: string;
  permissions: PermissionsRow;
}

interface UserRoleWithJoinedRole extends UserRolesRow {
  role: RolesRow;
}

/** Map a DB roles row to the app's Role interface */
function toRole(row: RolesRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    is_system: row.is_system,
    permissions: row.permissions,
    created_at: row.created_at,
  };
}

/** Map a DB permissions row to the app's Permission interface */
function toPermission(row: PermissionsRow): Permission {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    created_at: row.created_at,
  };
}

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
      // Validate that userId references a people.id row (not an auth UUID)
      const { data: person, error: personError } = await supabase
        .from('people')
        .select('id')
        .eq('id', request.userId)
        .maybeSingle();

      if (personError || !person) {
        throw new RoleError(
          `Invalid user_id: '${request.userId}' does not match a people record. ` +
            'Use people.id (not auth.uid()) for role assignments.',
          request.roleName ?? '',
          request.userId
        );
      }

      let roleId = request.roleId;
      let roleName = request.roleName;

      if (!roleId && roleName) {
        const { data: role, error: roleError } = await supabase
          .from('roles')
          .select('id')
          .eq('name', roleName)
          .single();

        if (roleError || !role) {
          throw new RoleError(`Role not found: ${roleName}`, roleName, request.userId);
        }
        roleId = role.id;
      } else if (roleId && !roleName) {
        const role = await this.getRole(roleId);
        roleName = role.name;
      }

      if (!roleId || !roleName) {
        throw new Error('Either roleName or roleId must be provided');
      }

      // Map scope to club_id/show_id (DB uses separate FK columns, not generic scope)
      const clubId = request.scopeType === 'club' ? (request.scopeId ?? null) : null;
      const showId = request.scopeType === 'show' ? (request.scopeId ?? null) : null;
      const currentUser = (await supabase.auth.getUser()).data.user;

      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          user_id: request.userId,
          role_id: roleId,
          club_id: clubId,
          show_id: showId,
          granted_by: currentUser?.id ?? null,
          granted_at: new Date().toISOString(),
          expires_at: request.expiresAt ?? null,
        })
        .select('id')
        .single();

      if (error) {
        throw new RoleError(`Failed to assign role: ${error.message}`, roleName, request.userId);
      }

      this.clearUserCache(request.userId);
      return data.id;
    } catch (error) {
      logger.error(
        'Role assignment failed',
        'rbac',
        { userId: request.userId, roleName: request.roleName },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Ensure a user has a role, optionally scoped to a club and/or show.
   * No-op if the role assignment already exists. Returns true if a new role was granted.
   */
  async ensureUserHasRole(
    userId: string,
    roleName: string,
    scopeOptions?: { clubId?: string; showId?: string }
  ): Promise<boolean> {
    const clubId = scopeOptions?.clubId;
    const showId = scopeOptions?.showId;

    // Look up the role ID
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single();

    if (roleError || !role) {
      logger.warn('ensureUserHasRole: role not found', 'rbac', { roleName });
      return false;
    }

    // Check if the assignment already exists (active or inactive)
    let query = supabase
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', userId)
      .eq('role_id', role.id);

    if (clubId) {
      query = query.eq('club_id', clubId);
    } else {
      query = query.is('club_id', null);
    }

    if (showId) {
      query = query.eq('show_id', showId);
    } else {
      query = query.is('show_id', null);
    }

    const { data: existing } = await query.limit(1);

    if (existing && existing.length > 0) {
      if (!existing[0].is_active) {
        // Reactivate the deactivated role
        const { error: reactivateError } = await supabase
          .from('user_roles')
          .update({ is_active: true })
          .eq('id', existing[0].id);
        if (reactivateError) {
          throw new Error(`Failed to reactivate role: ${reactivateError.message}`);
        }
        this.clearUserCache(userId);
        logger.info('Reactivated role', 'rbac', { userId, roleName, clubId, showId });
        return true;
      }
      return false; // Already has this active role
    }

    // Determine scope type
    let scopeType: string | undefined;
    let scopeId: string | undefined;
    if (showId) {
      scopeType = 'show';
      scopeId = showId;
    } else if (clubId) {
      scopeType = 'club';
      scopeId = clubId;
    }

    // Grant the role (catch unique constraint violations from concurrent calls)
    try {
      await this.assignRole({
        userId,
        roleName,
        roleId: role.id,
        scopeType,
        scopeId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        return false; // Race condition: another call granted it first
      }
      throw err;
    }

    logger.info('Auto-granted role', 'rbac', { userId, roleName, clubId, showId });
    return true;
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(request: RevokeRoleRequest): Promise<boolean> {
    try {
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('name', request.roleName)
        .single();

      if (roleError || !role) {
        throw new RoleError(
          `Role not found: ${request.roleName}`,
          request.roleName,
          request.userId
        );
      }

      let query = supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', request.userId)
        .eq('role_id', role.id);

      // Apply scope filter using actual DB columns
      if (request.scopeType === 'club' && request.scopeId) {
        query = query.eq('club_id', request.scopeId);
      } else if (request.scopeType === 'show' && request.scopeId) {
        query = query.eq('show_id', request.scopeId);
      }

      const { error } = await query;

      if (error) {
        throw new RoleError(
          `Failed to revoke role: ${error.message}`,
          request.roleName,
          request.userId
        );
      }

      this.clearUserCache(request.userId);
      return true;
    } catch (error) {
      logger.error(
        'Role revocation failed',
        'rbac',
        { userId: request.userId, roleName: request.roleName },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Create a new role
   */
  async createRole(request: CreateRoleRequest): Promise<Role> {
    try {
      // DB roles table: name, description, is_system, permissions (string[]), created_at
      // CreateRoleRequest.displayName has no DB column — UI-only concept
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .insert({
          name: request.name,
          description: request.description ?? null,
          is_system: false,
        })
        .select()
        .single();

      if (roleError) {
        throw new Error(`Failed to create role: ${roleError.message}`);
      }

      // Assign permissions to the role (by permission code, e.g. "show:manage")
      if (request.permissions.length > 0) {
        const { data: permissions } = await supabase
          .from('permissions')
          .select('id, code')
          .in('code', request.permissions);

        if (permissions && permissions.length > 0) {
          const rolePermissions = permissions.map(p => ({
            role_id: roleData.id,
            permission_id: p.id,
          }));

          await supabase.from('role_permissions').insert(rolePermissions);
        }
      }

      await this.auditLogger.logAuditEvent(ActionType.ROLE_CREATED, {
        targetId: roleData.id,
        targetType: 'role',
        newValue: {
          role_name: request.name,
          permissions_count: request.permissions.length,
        },
      });

      return toRole(roleData);
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
      // DB roles table only has: name, description, is_system, permissions, created_at
      // UpdateRoleRequest.displayName has no DB column
      const updateData: Record<string, unknown> = {};

      if (request.description !== undefined) {
        updateData.description = request.description;
      }

      let roleData;

      if (Object.keys(updateData).length > 0) {
        const { data, error } = await supabase
          .from('roles')
          .update(updateData)
          .eq('id', roleId)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to update role: ${error.message}`);
        }
        roleData = data;
      } else {
        // No column changes, just fetch current data
        roleData = await this.getRole(roleId);
      }

      // Update permissions if provided (by permission code)
      if (request.permissions !== undefined) {
        await supabase.from('role_permissions').delete().eq('role_id', roleId);

        if (request.permissions.length > 0) {
          const { data: permissions } = await supabase
            .from('permissions')
            .select('id, code')
            .in('code', request.permissions);

          if (permissions && permissions.length > 0) {
            const rolePermissions = permissions.map(p => ({
              role_id: roleId,
              permission_id: p.id,
            }));

            await supabase.from('role_permissions').insert(rolePermissions);
          }
        }
      }

      const auditValue: Record<string, unknown> = {};
      if (request.description !== undefined) auditValue.description = request.description;
      if (request.displayName !== undefined) auditValue.displayName = request.displayName;
      if (request.permissions !== undefined) auditValue.permissions = request.permissions;

      await this.auditLogger.logAuditEvent(ActionType.ROLE_UPDATED, {
        targetId: roleId,
        targetType: 'role',
        newValue: auditValue,
      });

      this.clearAllCache();
      return toRole(roleData);
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
        .from('roles')
        .delete()
        .eq('id', roleId)
        .eq('is_system', false);

      if (error) {
        throw new Error(`Failed to delete role: ${error.message}`);
      }

      await this.auditLogger.logAuditEvent(ActionType.ROLE_DELETED, {
        targetId: roleId,
        targetType: 'role',
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
    const { data, error } = await supabase.from('roles').select('*').order('name');

    if (error) {
      throw new Error(`Failed to get roles: ${error.message}`);
    }

    return (data || []).map(toRole);
  }

  /**
   * Get all permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase.from('permissions').select('*').order('code');

    if (error) {
      throw new Error(`Failed to get permissions: ${error.message}`);
    }

    return (data || []).map(toPermission);
  }

  /**
   * Get a single role by ID
   */
  async getRole(roleId: string): Promise<Role> {
    const { data, error } = await supabase.from('roles').select('*').eq('id', roleId).single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    return toRole(data);
  }

  /**
   * Get role with its permissions
   */
  async getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions> {
    const { data, error } = await supabase
      .from('roles')
      .select(
        `
        *,
        role_permissions (
          permissions (*)
        )
      `
      )
      .eq('id', roleId)
      .single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    const joined = data as unknown as RoleWithJoinedPermissions;
    const rolePerms = joined.role_permissions || [];

    return {
      ...toRole(joined),
      permissionList: rolePerms.map(rp => toPermission(rp.permissions)).filter(Boolean),
    };
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(
    roleId: string
  ): Promise<{ permission_id: string; permission: Permission }[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select(
        `
        permission_id,
        permissions!inner (
          id,
          code,
          name,
          description,
          category,
          created_at
        )
      `
      )
      .eq('role_id', roleId);

    if (error) {
      throw new Error(`Failed to get role permissions: ${error.message}`);
    }

    const rows = (data || []) as unknown as RolePermissionJoinRow[];
    return rows.map(item => ({
      permission_id: item.permission_id,
      permission: toPermission(item.permissions),
    }));
  }

  /**
   * Update permissions for a role
   */
  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    try {
      await supabase.from('role_permissions').delete().eq('role_id', roleId);

      if (permissionIds.length > 0) {
        // role_permissions table: role_id, permission_id (created_at is auto)
        const rolePermissions = permissionIds.map(permissionId => ({
          role_id: roleId,
          permission_id: permissionId,
        }));

        await supabase.from('role_permissions').insert(rolePermissions);
      }

      this.clearAllCache();
    } catch (error) {
      logger.error(
        'Failed to update role permissions',
        'rbac',
        { roleId, permissionCount: permissionIds.length },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Get all user role assignments
   */
  async getAllUserRoles(): Promise<UserRole[]> {
    const { data, error } = await supabase
      .from('user_roles')
      .select(
        `
        *,
        role:roles(*)
      `
      )
      .order('granted_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user roles: ${error.message}`);
    }

    const rows = (data || []) as unknown as UserRoleWithJoinedRole[];
    return rows.map(
      (item): UserRole => ({
        id: item.id,
        user_id: item.user_id,
        role_id: item.role_id,
        club_id: item.club_id,
        show_id: item.show_id,
        granted_by: item.granted_by,
        granted_at: item.granted_at,
        expires_at: item.expires_at,
        is_active: item.is_active,
        role: toRole(item.role),
        user_email: 'Unknown User',
        assigned_by_email: 'System',
      })
    );
  }

  /**
   * Revoke a user role by ID
   */
  async revokeUserRole(userRoleId: string): Promise<void> {
    try {
      // Get user_id before deletion for cache clearing
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('id', userRoleId)
        .single();

      // Soft-deactivate the role assignment
      const { error } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('id', userRoleId);

      if (error) {
        throw new Error(`Failed to revoke user role: ${error.message}`);
      }

      if (userRole) {
        this.clearUserCache(userRole.user_id);
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
        .from('roles')
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
        granted_by: userId,
        granted_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('user_roles').insert(userRoles);

      if (insertError) {
        throw new Error(`Failed to migrate user roles: ${insertError.message}`);
      }

      this.clearUserCache(userId);

      await this.auditLogger.logAuditEvent(ActionType.ROLE_ASSIGNED, {
        targetId: userId,
        targetType: 'user',
        newValue: { migrated_roles: roles },
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
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        throw new Error(`Failed to check migration status: ${error.message}`);
      }

      const isMigrated = data !== null && data.length > 0;
      return {
        isMigrated,
        needsMigration: !isMigrated,
      };
    } catch (error) {
      logger.error('Migration check failed', 'rbac', { userId }, error as Error);
      return {
        isMigrated: false,
        needsMigration: false,
      };
    }
  }
}
