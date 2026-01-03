/**
 * RBAC Higher-Order Components
 * Utility functions for permission and role-based component wrapping
 */

import React from 'react';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';

/**
 * HOC for permission-based rendering
 */
export function withPermission<T extends object>(
  Component: React.ComponentType<T>,
  permission: string,
  scope?: { type: string; id: string }
) {
  return function PermissionWrappedComponent(props: T) {
    return (
      <PermissionGuard permission={permission} scope={scope}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
}

/**
 * HOC for role-based rendering
 */
export function withRole<T extends object>(
  Component: React.ComponentType<T>,
  roles: string | string[]
) {
  return function RoleWrappedComponent(props: T) {
    return (
      <PermissionGuard permission="" roles={Array.isArray(roles) ? roles : [roles]}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
}