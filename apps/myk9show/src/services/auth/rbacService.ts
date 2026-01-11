// RBAC Service for integrating with Supabase RBAC system
import { supabase } from '../database/supabaseClient';
import { logger } from '@/services/LoggingService';

export interface UserRole {
  role_id: string;
  role_name: string;
  role_display_name: string;
  scope_type?: string;
  scope_id?: string;
  assigned_at: string;
  expires_at?: string;
  is_active: boolean;
}

export interface UserPermission {
  permission_name: string;
  permission_display_name: string;
  resource: string;
  action: string;
  role_name: string;
  role_display_name: string;
  scope_type?: string;
  scope_id?: string;
}

export class RBACService {
  /**
   * Check if current user has a specific permission
   */
  static async hasPermission(
    permission: string,
    scopeType?: string,
    scopeId?: string
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc('user_has_permission', {
      user_id: user.id,
      permission_name: permission,
      scope_type: scopeType,
      scope_id: scopeId
    });

    if (error) {
      logger.error('Error checking permission', 'rbac', { permission, scopeType, scopeId }, error as Error);
      return false;
    }

    return data as boolean;
  }

  /**
   * Get all permissions for current user
   */
  static async getUserPermissions(
    scopeType?: string,
    scopeId?: string
  ): Promise<UserPermission[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc('get_user_permissions', {
      user_id: user.id,
      filter_scope_type: scopeType,
      filter_scope_id: scopeId
    });

    if (error) {
      logger.error('Error fetching permissions', 'rbac', { scopeType, scopeId }, error as Error);
      return [];
    }

    return data as UserPermission[];
  }

  /**
   * Get all roles for current user
   */
  static async getUserRoles(): Promise<UserRole[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc('get_user_roles', {
      user_id: user.id
    });

    if (error) {
      logger.error('Error fetching roles', 'rbac', {}, error as Error);
      return [];
    }

    return data as UserRole[];
  }

  /**
   * Check if current user is site admin
   */
  static async isSiteAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc('is_site_admin', {
      user_id: user.id
    });

    if (error) {
      logger.error('Error checking admin status', 'rbac', {}, error as Error);
      return false;
    }

    return data as boolean;
  }

  /**
   * Get effective permissions (with inheritance)
   */
  static async getEffectivePermissions(
    scopeType?: string,
    scopeId?: string
  ): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase.rpc('get_effective_permissions', {
      user_id: user.id,
      filter_scope_type: scopeType,
      filter_scope_id: scopeId
    });

    if (error) {
      logger.error('Error fetching effective permissions', 'rbac', { scopeType, scopeId }, error as Error);
      return [];
    }

    return (data as { permission_name: string }[]).map(p => p.permission_name);
  }

  /**
   * Assign role to user (admin only)
   */
  static async assignRole(
    targetUserId: string,
    roleName: string,
    scopeType?: string,
    scopeId?: string,
    expiresAt?: string
  ): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase.rpc('assign_user_role', {
      target_user_id: targetUserId,
      role_name: roleName,
      scope_type: scopeType,
      scope_id: scopeId,
      expires_at: expiresAt,
      assigned_by_user_id: user.id
    });

    if (error) {
      logger.error('Error assigning role', 'rbac', { targetUserId, roleName, scopeType, scopeId }, error as Error);
      return null;
    }

    return data as string;
  }

  /**
   * Revoke role from user (admin only)
   */
  static async revokeRole(
    targetUserId: string,
    roleName: string,
    scopeType?: string,
    scopeId?: string
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase.rpc('revoke_user_role', {
      target_user_id: targetUserId,
      role_name: roleName,
      scope_type: scopeType,
      scope_id: scopeId,
      revoked_by_user_id: user.id
    });

    if (error) {
      logger.error('Error revoking role', 'rbac', { targetUserId, roleName, scopeType, scopeId }, error as Error);
      return false;
    }

    return data as boolean;
  }
}

// Permission constants for type safety
export const PERMISSIONS = {
  // Admin
  ADMIN_MANAGE: 'admin:manage',
  ADMIN_VIEW: 'admin:view',
  
  // User management
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE: 'user:manage',
  
  // Show management
  SHOW_CREATE: 'show:create',
  SHOW_READ: 'show:read',
  SHOW_UPDATE: 'show:update',
  SHOW_DELETE: 'show:delete',
  SHOW_MANAGE: 'show:manage',
  
  // Entry management
  ENTRY_CREATE: 'entry:create',
  ENTRY_READ: 'entry:read',
  ENTRY_UPDATE: 'entry:update',
  ENTRY_DELETE: 'entry:delete',
  ENTRY_MANAGE: 'entry:manage',
  
  // Dog management
  DOG_CREATE: 'dog:create',
  DOG_READ: 'dog:read',
  DOG_UPDATE: 'dog:update',
  DOG_DELETE: 'dog:delete',
  DOG_MANAGE: 'dog:manage',
} as const;

// Role constants
export const ROLES = {
  SITE_ADMIN: 'site_admin',
  SECRETARY: 'secretary',
  EXHIBITOR: 'exhibitor',
  JUDGE: 'judge',
} as const;