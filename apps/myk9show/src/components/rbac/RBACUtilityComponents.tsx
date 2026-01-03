/**
 * RBAC Utility Components
 * Additional guard components and development utilities
 */

import React, { ReactNode } from 'react';
import { PermissionGuard } from './PermissionGuard';
import { useRBAC } from '@/hooks/useRBAC';

/**
 * Resource-specific permission guard
 */
export const ResourceGuard: React.FC<{
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
  scope?: { type: string; id: string };
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ resource, action, scope, children, fallback }) => {
  const permission = `${resource}:${action}`;
  
  return (
    <PermissionGuard permission={permission} scope={scope} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
};

/**
 * Scoped permission guard for specific entities
 */
export const ScopedGuard: React.FC<{
  permission: string;
  scopeType: 'club' | 'show' | 'global';
  scopeId?: string;
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ permission, scopeType, scopeId, children, fallback }) => {
  const scope = scopeType !== 'global' && scopeId 
    ? { type: scopeType, id: scopeId }
    : undefined;

  return (
    <PermissionGuard permission={permission} scope={scope} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
};

/**
 * Development-only component for testing permissions
 */
export const PermissionDebugger: React.FC<{
  userId?: string;
  showRoles?: boolean;
  showPermissions?: boolean;
}> = ({ userId: _userId, showRoles = true, showPermissions = true }) => {
  // Suppress unused parameter warnings - reserved for future functionality
  void _userId;
  const { userRoles, userPermissions: _userPermissions, effectivePermissions, isLoading } = useRBAC();
  // Suppress unused variable warnings - reserved for future functionality  
  void _userPermissions;

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Loading permissions...</div>;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-md max-h-96 overflow-auto">
      <h4 className="font-bold mb-2">RBAC Debug Info</h4>
      
      {showRoles && (
        <div className="mb-2">
          <strong>Roles ({userRoles.length}):</strong>
          <ul className="list-disc list-inside ml-2">
            {userRoles.map(ur => (
              <li key={ur.id}>
                {ur.role?.display_name} 
                {ur.scope_type && ` (${ur.scope_type}:${ur.scope_id})`}
                {!ur.is_active && ' [INACTIVE]'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPermissions && (
        <div>
          <strong>Effective Permissions ({effectivePermissions.length}):</strong>
          <ul className="list-disc list-inside ml-2">
            {effectivePermissions.slice(0, 10).map(perm => (
              <li key={perm}>{perm}</li>
            ))}
            {effectivePermissions.length > 10 && (
              <li>... and {effectivePermissions.length - 10} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};