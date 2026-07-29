/**
 * RBAC React Hooks
 * Phase 2.5: Update auth hooks to use database permissions
 * Created: December 2024
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthContext } from './useAuthContext';
import { rbacService } from '@/services/rbac/RBACService';
import {
  UserRoleWithDetails,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  RBACContextValue,
} from '@/types/rbac-types';

/**
 * Main RBAC hook for permission checking and role management
 */
export function useRBAC(): RBACContextValue {
  const {
    user,
    dbPermissions,
    rbacUserRoles,
    rbacScopedPermissions,
    rbacLoading,
    rbacError,
    rbacLastRefreshed,
    hasPermission: hasContextPermission,
    checkPermissionAsync,
    refreshPermissions,
  } = useAuthContext();

  const hasPermission = useCallback(
    (permission: string, scope?: { type: string; id: string }): boolean =>
      !!user?.id && hasContextPermission(permission, scope),
    [hasContextPermission, user?.id]
  );

  // Point-in-time asynchronous checks never overwrite the shared access snapshot.
  const checkPermission = useCallback(
    async (permission: string, scope?: { type: string; id: string }): Promise<boolean> => {
      if (!user?.id) return false;

      try {
        return await checkPermissionAsync(permission, scope);
      } catch {
        return false;
      }
    },
    [checkPermissionAsync, user?.id]
  );

  // Admin functions (only available if user has admin permissions)
  const isAdmin = useMemo(() => hasPermission('admin:manage'), [hasPermission]);

  const assignRole = useCallback(
    async (request: AssignRoleRequest): Promise<void> => {
      if (!isAdmin) {
        throw new Error('Insufficient permissions to assign roles');
      }

      await rbacService.assignRole(request);
      await refreshPermissions();
    },
    [isAdmin, refreshPermissions]
  );

  const revokeRole = useCallback(
    async (request: RevokeRoleRequest): Promise<void> => {
      if (!isAdmin) {
        throw new Error('Insufficient permissions to revoke roles');
      }

      await rbacService.revokeRole(request);
      await refreshPermissions();
    },
    [isAdmin, refreshPermissions]
  );

  const createRole = useCallback(
    async (request: CreateRoleRequest) => {
      if (!isAdmin) {
        throw new Error('Insufficient permissions to create roles');
      }

      const role = await rbacService.createRole(request);
      await refreshPermissions();
      return role;
    },
    [isAdmin, refreshPermissions]
  );

  const updateRole = useCallback(
    async (roleId: string, request: UpdateRoleRequest) => {
      if (!isAdmin) {
        throw new Error('Insufficient permissions to update roles');
      }

      const result = await rbacService.updateRole(roleId, request);
      await refreshPermissions();
      return result;
    },
    [isAdmin, refreshPermissions]
  );

  // Clear cache
  const clearCache = useCallback(() => {
    rbacService.clearUserCache(user?.id || '');
  }, [user?.id]);

  // Refresh
  const refresh = useCallback(async () => {
    clearCache();
    await refreshPermissions();
  }, [clearCache, refreshPermissions]);

  return {
    // Permission checking
    hasPermission,
    checkPermission,

    // User data
    userRoles: rbacUserRoles,
    userPermissions: rbacScopedPermissions,
    effectivePermissions: dbPermissions,

    // Admin functions (conditionally available)
    ...(isAdmin
      ? {
          assignRole,
          revokeRole,
          createRole,
          updateRole,
        }
      : {}),

    // State
    isLoading: rbacLoading,
    error: rbacError,

    lastRefreshed: rbacLastRefreshed,

    // Actions
    refresh,
    clearCache,
  };
}

/**
 * Simple permission checking hook
 */
export function usePermission(
  permission: string,
  scope?: { type: string; id: string }
): {
  hasPermission: boolean;
  isLoading: boolean;
  checkPermission: () => Promise<boolean>;
} {
  const { user } = useAuthContext();
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Stabilize scope reference to prevent infinite re-render loops
  // when scope is passed as an object literal
  const scopeKey = scope ? `${scope.type}:${scope.id}` : '';

  const checkPermission = useCallback(async (): Promise<boolean> => {
    if (!user?.id) {
      setHasPermission(false);
      setIsLoading(false);
      return false;
    }

    try {
      setIsLoading(true);
      const scopeObj = scopeKey
        ? { type: scopeKey.split(':')[0], id: scopeKey.split(':')[1] }
        : undefined;
      const result = await rbacService.checkPermission(user.id, permission, scopeObj);
      setHasPermission(result);
      return result;
    } catch {
      setHasPermission(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, permission, scopeKey]);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  return {
    hasPermission,
    isLoading,
    checkPermission,
  };
}

/**
 * Role checking hook
 */
export function useRole(roleName: string): {
  hasRole: boolean;
  isLoading: boolean;
  roleDetails: UserRoleWithDetails | null;
} {
  const { userRoles, isLoading } = useRBAC();

  const roleDetails = useMemo(
    () => userRoles.find(ur => ur.role?.name === roleName && ur.is_active) || null,
    [userRoles, roleName]
  );

  const hasRole = useMemo(() => roleDetails !== null, [roleDetails]);

  return {
    hasRole,
    isLoading,
    roleDetails,
  };
}

/**
 * Admin status hook
 */
export function useIsAdmin(): {
  isAdmin: boolean;
  isLoading: boolean;
} {
  const { hasPermission, isLoading } = useRBAC();

  const isAdmin = useMemo(() => hasPermission('admin:manage'), [hasPermission]);

  return {
    isAdmin,
    isLoading,
  };
}

/**
 * Scoped permissions hook for specific resources
 */
export function useScopedPermissions(
  resource: string,
  scope?: { type: string; id: string }
): {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManage: boolean;
  isLoading: boolean;
} {
  const { hasPermission, isLoading } = useRBAC();

  const permissions = useMemo(
    () => ({
      canCreate: hasPermission(`${resource}:create`, scope),
      canRead: hasPermission(`${resource}:read`, scope),
      canUpdate: hasPermission(`${resource}:update`, scope),
      canDelete: hasPermission(`${resource}:delete`, scope),
      canManage: hasPermission(`${resource}:manage`, scope),
    }),
    [hasPermission, resource, scope]
  );

  return {
    ...permissions,
    isLoading,
  };
}

/**
 * Backward compatibility hook - maintains existing interface
 * while adding database-driven functionality
 */
export function useRoleBasedPermissions() {
  const { user } = useAuthContext();
  const rbac = useRBAC();

  // Maintain backward compatibility with existing auth context
  const hasRole = useCallback(
    (roleName: string): boolean => {
      return rbac.userRoles.some(ur => ur.role?.name === roleName && ur.is_active);
    },
    [rbac.userRoles]
  );

  const hasPermission = useCallback(
    (permission: string): boolean => {
      return rbac.hasPermission(permission);
    },
    [rbac]
  );

  // Legacy role checking methods
  const isAdmin = hasRole('site_admin');
  const isSecretary = hasRole('secretary');
  const isExhibitor = hasRole('exhibitor');
  const isJudge = hasRole('judge');

  return {
    // User info
    user,

    // Role checking
    hasRole,
    isAdmin,
    isSecretary,
    isExhibitor,
    isJudge,

    // New RBAC features
    ...rbac,

    // Permission checking (override any from rbac)
    hasPermission,
  };
}
