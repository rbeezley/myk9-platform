/**
 * RBAC React Hooks
 * Phase 2.5: Update auth hooks to use database permissions
 * Created: December 2024
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthContext } from './useAuthContext';
import { rbacService } from '@/services/rbac/RBACService';
import {
  // UserPermissionsResponse, // Not used
  PermissionWithRole,
  UserRoleWithDetails,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  UseRBACOptions,
  RBACContextValue
} from '@/types/rbac-types';

/**
 * Main RBAC hook for permission checking and role management
 */
export function useRBAC(options: UseRBACOptions = {}): RBACContextValue {
  const { user } = useAuthContext();
  const {
    refreshInterval = 5 * 60 * 1000, // 5 minutes
    cacheTimeout = 5 * 60 * 1000, // 5 minutes
    enableRealTimeUpdates = true // Reserved for future real-time feature implementation
  } = options;
  
  // Suppress unused variable warning - enableRealTimeUpdates reserved for future use
  void enableRealTimeUpdates;

  const [userPermissions, setUserPermissions] = useState<PermissionWithRole[]>([]);
  const [userRoles, setUserRoles] = useState<UserRoleWithDetails[]>([]);
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Changed from true to false
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  // Permission cache for fast synchronous checks
  const [permissionCache, setPermissionCache] = useState<Map<string, boolean>>(new Map());

  // Set cache timeout in service
  useEffect(() => {
    rbacService.setCacheTimeout(cacheTimeout);
  }, [cacheTimeout]);

  // Load user permissions and roles
  const loadUserData = useCallback(async () => {
    if (!user?.id) {
      setUserPermissions([]);
      setUserRoles([]);
      setEffectivePermissions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await rbacService.getUserPermissions(user.id);

      setUserPermissions(data.permissions);
      setUserRoles(data.roles);
      setEffectivePermissions(data.effectivePermissions);

      // Update permission cache
      const newCache = new Map<string, boolean>();
      data.effectivePermissions.forEach(permission => {
        newCache.set(permission, true);
      });
      setPermissionCache(newCache);

      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Periodic refresh
  useEffect(() => {
    if (!user?.id || refreshInterval <= 0) return;

    const interval = setInterval(loadUserData, refreshInterval);
    return () => clearInterval(interval);
  }, [loadUserData, refreshInterval, user?.id]);

  // Synchronous permission check (uses cache)
  const hasPermission = useCallback((
    permission: string,
    scope?: { type: string; id: string }
  ): boolean => {
    if (!user?.id) {
      return false;
    }

    // For now, use simple permission checking without scope
    // Scope checking will be enhanced in future iterations
    // Suppress unused parameter warning - scope reserved for future scoped permission feature
    void scope;

    return permissionCache.has(permission) && permissionCache.get(permission) === true;
  }, [user?.id, permissionCache]);

  // Asynchronous permission check (queries database)
  const checkPermission = useCallback(async (
    permission: string,
    scope?: { type: string; id: string }
  ): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const hasPermission = await rbacService.checkPermission(user.id, permission, scope);
      
      // Update cache
      setPermissionCache(prev => {
        const newCache = new Map(prev);
        const cacheKey = scope ? `${permission}:${scope.type}:${scope.id}` : permission;
        newCache.set(cacheKey, hasPermission);
        return newCache;
      });
      
      return hasPermission;
    } catch {
      return false;
    }
  }, [user?.id]);

  // Admin functions (only available if user has admin permissions)
  const isAdmin = useMemo(() => 
    hasPermission('admin:manage'), 
    [hasPermission]
  );

  const assignRole = useCallback(async (request: AssignRoleRequest): Promise<void> => {
    if (!isAdmin) {
      throw new Error('Insufficient permissions to assign roles');
    }

    await rbacService.assignRole(request);
    
    // Refresh data if assigning to current user
    if (request.userId === user?.id) {
      await loadUserData();
    }
  }, [isAdmin, user?.id, loadUserData]);

  const revokeRole = useCallback(async (request: RevokeRoleRequest): Promise<void> => {
    if (!isAdmin) {
      throw new Error('Insufficient permissions to revoke roles');
    }

    await rbacService.revokeRole(request);
    
    // Refresh data if revoking from current user
    if (request.userId === user?.id) {
      await loadUserData();
    }
  }, [isAdmin, loadUserData, user?.id]);

  const createRole = useCallback(async (request: CreateRoleRequest) => {
    if (!isAdmin) {
      throw new Error('Insufficient permissions to create roles');
    }

    return await rbacService.createRole(request);
  }, [isAdmin]);

  const updateRole = useCallback(async (roleId: string, request: UpdateRoleRequest) => {
    if (!isAdmin) {
      throw new Error('Insufficient permissions to update roles');
    }

    const result = await rbacService.updateRole(roleId, request);
    
    // Refresh user data if any of their roles were updated
    const userRoleIds = userRoles.map(ur => ur.role_id);
    if (userRoleIds.includes(roleId)) {
      await loadUserData();
    }
    
    return result;
  }, [isAdmin, userRoles, loadUserData]);

  // Clear cache
  const clearCache = useCallback(() => {
    rbacService.clearUserCache(user?.id || '');
    setPermissionCache(new Map());
  }, [user?.id]);

  // Refresh
  const refresh = useCallback(async () => {
    clearCache();
    await loadUserData();
  }, [clearCache, loadUserData]);

  return {
    // Permission checking
    hasPermission,
    checkPermission,
    
    // User data
    userRoles,
    userPermissions,
    effectivePermissions,
    
    // Admin functions (conditionally available)
    ...(isAdmin ? {
      assignRole,
      revokeRole,
      createRole,
      updateRole
    } : {}),
    
    // State
    isLoading,
    error,
    
    lastRefreshed,
    
    // Actions
    refresh,
    clearCache
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
      const scopeObj = scopeKey ? { type: scopeKey.split(':')[0], id: scopeKey.split(':')[1] } : undefined;
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
    checkPermission
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

  const roleDetails = useMemo(() => 
    userRoles.find(ur => ur.role?.name === roleName && ur.is_active) || null,
    [userRoles, roleName]
  );

  const hasRole = useMemo(() => 
    roleDetails !== null,
    [roleDetails]
  );

  return {
    hasRole,
    isLoading,
    roleDetails
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

  const isAdmin = useMemo(() => 
    hasPermission('admin:manage'),
    [hasPermission]
  );

  return {
    isAdmin,
    isLoading
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

  const permissions = useMemo(() => ({
    canCreate: hasPermission(`${resource}:create`, scope),
    canRead: hasPermission(`${resource}:read`, scope),
    canUpdate: hasPermission(`${resource}:update`, scope),
    canDelete: hasPermission(`${resource}:delete`, scope),
    canManage: hasPermission(`${resource}:manage`, scope)
  }), [hasPermission, resource, scope]);

  return {
    ...permissions,
    isLoading
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
  const hasRole = useCallback((roleName: string): boolean => {
    return rbac.userRoles.some(ur => 
      ur.role?.name === roleName && ur.is_active
    );
  }, [rbac.userRoles]);

  const hasPermission = useCallback((permission: string): boolean => {
    return rbac.hasPermission(permission);
  }, [rbac]);

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