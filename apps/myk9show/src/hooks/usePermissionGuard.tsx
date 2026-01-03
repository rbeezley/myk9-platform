import React from 'react';
import { useRegistrationPermissions } from './useRegistrationPermissions';
import { Permission, UserRole, Scope } from '../types/auth-types';
import { PermissionGuard } from '../components/auth/PermissionGuard';

/**
 * Hook version of PermissionGuard for programmatic checks
 */
export function usePermissionGuard() {
  const { can, hasRole } = useRegistrationPermissions();
  
  return {
    can,
    hasRole,
    /**
     * Check multiple conditions at once
     */
    check: (conditions: {
      permission?: Permission;
      role?: UserRole | UserRole[];
      scope?: Scope;
      requireAll?: boolean;
      customCheck?: () => boolean;
    }) => {
      const { permission, role, scope, requireAll = false, customCheck } = conditions;
      
      if (customCheck) {
        return customCheck();
      }
      
      let permissionResult = true;
      let roleResult = true;
      
      // Check permission if specified
      if (permission) {
        permissionResult = can(permission, scope);
      }
      
      // Check role if specified
      if (role) {
        if (Array.isArray(role)) {
          if (requireAll) {
            roleResult = role.every(r => hasRole(r));
          } else {
            roleResult = role.some(r => hasRole(r));
          }
        } else {
          roleResult = hasRole(role);
        }
      }
      
      // Combine results
      if (permission && role) {
        return requireAll ? (permissionResult && roleResult) : (permissionResult || roleResult);
      }
      
      if (permission) return permissionResult;
      if (role) return roleResult;
      
      return true;
    }
  };
}

/**
 * Higher-order component version of PermissionGuard
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  guardProps: Omit<React.ComponentProps<typeof PermissionGuard>, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <PermissionGuard {...guardProps}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
}