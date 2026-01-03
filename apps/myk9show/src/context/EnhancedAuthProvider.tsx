/**
 * Enhanced Auth Provider Component
 * Phase 2.5: Integration layer between old auth and new RBAC system
 * Created: December 2024
 */

import React, { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
// import { useRBAC } from '@/hooks/useRBAC'; // Don't use this inside the provider - circular dependency
import { 
  UserWithRoles, 
  UserRole, 
  Permission, 
  Scope,
  ScopeType,
  // DEFAULT_ROLE_PERMISSIONS // Currently unused 
} from '@/types/auth-types';

// Type for user role with details from RBAC service
interface UserRoleWithDetails {
  role_id: string;
  role?: { 
    name?: string; 
    display_name?: string; 
  };
  scope_type?: string | null;
  scope_id?: string | null;
  assigned_at?: string;
  is_active?: boolean;
}

import { rbacService } from '@/services/rbac/RBACService';
import { EnhancedAuthContext, EnhancedAuthContextType } from '@/context/EnhancedAuthContext';

export function EnhancedAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  
  // State for RBAC data - we'll manage this directly to avoid circular dependency
  const [rbacData, setRbacData] = useState({
    userRoles: [] as UserRoleWithDetails[],
    effectivePermissions: [] as string[],
    isLoading: false,
    error: null as string | null
  });
  
  // Migration state - tracks if user has been migrated to database RBAC
  const [isMigrated, setIsMigrated] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // Load RBAC data when user changes
  useEffect(() => {
    if (!auth.user?.id) {
      setRbacData({
        userRoles: [],
        effectivePermissions: [],
        isLoading: false,
        error: null
      });
      return;
    }

    const loadRbacData = async () => {
      try {
        setRbacData(prev => ({ ...prev, isLoading: true, error: null }));
        const data = await rbacService.getUserPermissions(auth.user!.id);
        setRbacData({
          userRoles: data.roles.map((role: UserRoleWithDetails) => ({
            ...role,
            scope_type: role.scope_type || undefined
          })),
          effectivePermissions: data.effectivePermissions,
          isLoading: false,
          error: null
        });
      } catch (error) {
        console.error('Failed to load RBAC data:', error);
        setRbacData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load permissions'
        }));
      }
    };

    loadRbacData();
  }, [auth.user]);

  // User with roles - combines auth user with RBAC roles
  const userWithRoles: UserWithRoles | null = auth.user ? {
    ...auth.user,
    roles: rbacData.userRoles.map(ur => ur.role?.name as UserRole).filter(Boolean),
    permissions: rbacData.effectivePermissions as Permission[],
    scopes: rbacData.userRoles.filter(ur => ur.scope_type && ur.scope_id).map(ur => ({
      userId: auth.user!.id,
      roleId: ur.role_id,
      scopeType: ur.scope_type! as ScopeType,
      scopeId: ur.scope_id!,
      createdAt: new Date(ur.assigned_at || Date.now())
    }))
  } : null;

  // Migration check
  useEffect(() => {
    if (auth.user?.id && !isMigrated) {
      rbacService.checkUserMigration(auth.user.id)
        .then(result => {
          setIsMigrated(result.isMigrated);
          if (!result.isMigrated && result.needsMigration) {
            // Auto-migrate basic roles from legacy system
            rbacService.migrateUserRoles(auth.user!.id, userWithRoles?.roles || [])
              .then(() => {
                setIsMigrated(true);
                // Refresh RBAC data after migration
                if (auth.user?.id) {
                  rbacService.getUserPermissions(auth.user.id)
                    .then(data => {
                      setRbacData({
                        userRoles: data.roles.map((role: UserRoleWithDetails) => ({
                          ...role,
                          scope_type: role.scope_type || undefined
                        })),
                        effectivePermissions: data.effectivePermissions,
                        isLoading: false,
                        error: null
                      });
                    })
                    .catch(console.error);
                }
              })
              .catch(err => {
                setMigrationError(err.message);
              });
          }
        })
        .catch(err => {
          setMigrationError(err.message);
        });
    }
  }, [auth.user?.id, auth.user, isMigrated, userWithRoles?.roles]);

  // Enhanced role checking
  const hasRole = (role: UserRole | string): boolean => {
    if (!userWithRoles) return false;
    
    // Database-driven role check
    if (rbacData.userRoles.length > 0) {
      return rbacData.userRoles.some(ur => ur.role?.name === role && (ur.is_active ?? true));
    }
    
    // Fallback to legacy role checking
    return userWithRoles.roles.includes(role as UserRole);
  };

  // Enhanced permission checking
  const hasPermission = (
    permission: Permission | string, 
    scope?: Scope | { type: string; id: string }
  ): boolean => {
    if (!userWithRoles) return false;
    
    // Database-driven permission check
    if (rbacData.effectivePermissions.length > 0) {
      if (!rbacData.effectivePermissions.includes(permission as string)) {
        return false;
      }
      
      // Scope checking for database permissions
      if (scope && rbacData.userRoles.length > 0) {
        return rbacData.userRoles.some(ur => 
          ur.scope_type === scope.type && 
          ur.scope_id === scope.id &&
          (ur.is_active ?? true)
        );
      }
      
      return true;
    }
    
    // Fallback to legacy permission checking
    if (!userWithRoles.permissions.includes(permission as Permission)) {
      return false;
    }
    
    // Legacy scope checking
    if (scope && userWithRoles.scopes.length > 0) {
      return userWithRoles.scopes.some(s => 
        s.scopeType === (scope as Scope).type && s.scopeId === (scope as Scope).id
      );
    }
    
    return true;
  };

  // Async permission checking
  const checkPermissionAsync = async (
    permission: string, 
    scope?: { type: string; id: string }
  ): Promise<boolean> => {
    if (!auth.user?.id) return false;
    return await rbacService.checkPermission(auth.user.id, permission, scope);
  };

  // Get all user roles
  const getUserRoles = (): UserRole[] => {
    if (rbacData.userRoles.length > 0) {
      return rbacData.userRoles
        .filter(ur => ur.is_active ?? true)
        .map(ur => ur.role?.name as UserRole)
        .filter(Boolean);
    }
    return userWithRoles?.roles || [];
  };



  // Convenience role checks
  const isAdmin = hasRole('site_admin');
  const isSecretary = hasRole('secretary');
  const isExhibitor = hasRole('exhibitor');
  const isJudge = hasRole('judge');

  // Admin functions
  const assignRole = isAdmin ? async (
    userId: string, 
    roleName: string, 
    scope?: { type: string; id: string }
  ): Promise<void> => {
    await rbacService.assignRole({
      userId,
      roleName,
      scopeType: scope?.type,
      scopeId: scope?.id
    });
  } : undefined;

  const revokeRole = isAdmin ? async (
    userId: string, 
    roleName: string, 
    scope?: { type: string; id: string }
  ): Promise<void> => {
    await rbacService.revokeRole({
      userId,
      roleName,
      scopeType: scope?.type,
      scopeId: scope?.id
    });
  } : undefined;

  const value: EnhancedAuthContextType = {
    // Original auth methods
    ...auth,
    userWithRoles,
    
    // Enhanced RBAC methods
    hasRole,
    hasPermission,
    getUserRoles,
    
    // New features
    checkPermissionAsync,
    isAdmin,
    isSecretary,
    isExhibitor,
    isJudge,
    
    // Database state
    dbPermissions: rbacData.effectivePermissions,
    dbRoles: rbacData.userRoles.map(ur => ({
      id: ur.role_id,
      name: ur.role?.name || '',
      display_name: ur.role?.display_name || ur.role?.name || ''
    })),
    rbacLoading: rbacData.isLoading,
    rbacError: rbacData.error || migrationError,
    
    // Admin functions
    ...(isAdmin ? { assignRole, revokeRole } : {}),
    
    // Utilities
    refreshPermissions: async () => {
      if (auth.user?.id) {
        try {
          const data = await rbacService.getUserPermissions(auth.user.id);
          setRbacData({
            userRoles: data.roles.map((role: UserRoleWithDetails) => ({
              ...role,
              scope_type: role.scope_type || undefined
            })),
            effectivePermissions: data.effectivePermissions,
            isLoading: false,
            error: null
          });
        } catch (error) {
          console.error('Failed to refresh RBAC data:', error);
          setRbacData(prev => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to refresh permissions'
          }));
        }
      }
    }
  };

  return (
    <EnhancedAuthContext.Provider value={value}>
      {children}
    </EnhancedAuthContext.Provider>
  );
}