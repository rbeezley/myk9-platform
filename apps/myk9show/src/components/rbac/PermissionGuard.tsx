/**
 * Enhanced Permission Guard Component
 * Phase 2.5: Database-driven permission checking
 * Created: December 2024
 */

import React, { ReactNode } from 'react';
import { useRBAC } from '@/hooks/useRBAC';
import { isRoleAssignmentCurrent } from '@/services/rbac/roleAssignment';
import { Lock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PermissionGuardProps {
  children: ReactNode;
  /** Single permission code. Empty or omitted means no single-permission check. */
  permission?: string | undefined;
  scope?:
    | {
        type: string;
        id: string;
      }
    | undefined;
  fallback?: ReactNode | undefined;
  /** When false, a denied (or still loading) guard renders nothing. */
  showFallback?: boolean | undefined;
  requireAll?: string[] | undefined; // Require all these permissions
  requireAny?: string[] | undefined; // Require any of these permissions
  roles?: string[] | undefined; // Require any one of these (current) roles
  onPermissionDenied?: (() => void) | undefined;
  loading?: ReactNode | undefined;
  className?: string | undefined;
}

/**
 * The one PermissionGuard. Every check that is given must pass (AND): the
 * single permission, all of requireAll, any of requireAny, and any of roles.
 * Permission checks go through useRBAC (scope-aware); role checks ignore
 * inactive and expired assignments. With no check given, access is denied.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  permission,
  scope,
  fallback,
  showFallback = true,
  requireAll,
  requireAny,
  roles,
  onPermissionDenied,
  loading,
  className,
}) => {
  const { hasPermission, userRoles, isLoading } = useRBAC();

  let hasAccess = false;
  if (!isLoading) {
    const checks: boolean[] = [];
    if (permission) checks.push(hasPermission(permission, scope));
    if (requireAll && requireAll.length > 0) {
      checks.push(requireAll.every(perm => hasPermission(perm, scope)));
    }
    if (requireAny && requireAny.length > 0) {
      checks.push(requireAny.some(perm => hasPermission(perm, scope)));
    }
    if (roles && roles.length > 0) {
      const current = new Set(
        userRoles.filter(ur => isRoleAssignmentCurrent(ur)).map(ur => ur.role?.name)
      );
      checks.push(roles.some(role => current.has(role)));
    }
    hasAccess = checks.length > 0 && checks.every(Boolean);
  }

  const denied = !isLoading && !hasAccess;
  React.useEffect(() => {
    if (denied && onPermissionDenied) onPermissionDenied();
  }, [denied, onPermissionDenied]);

  if (isLoading) {
    if (loading) return <>{loading}</>;
    if (!showFallback) return null;

    return (
      <div className={`flex items-center justify-center p-4 ${className || ''}`}>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Checking permissions...</span>
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (!showFallback) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className={`p-4 ${className || ''}`}>
      <Alert variant="destructive">
        <Lock className="h-4 w-4" />
        <AlertDescription className="flex items-center">
          <span>You don't have permission to access this feature.</span>
        </AlertDescription>
      </Alert>
    </div>
  );
};

/**
 * Simple permission wrapper for inline checks
 */
export const IfPermission: React.FC<{
  permission: string;
  scope?: { type: string; id: string };
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ permission, scope, children, fallback }) => {
  const { hasPermission } = useRBAC();

  if (hasPermission(permission, scope)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Role-based wrapper component
 */
export const IfRole: React.FC<{
  roles: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ roles, children, fallback }) => {
  const { userRoles } = useRBAC();

  const roleArray = Array.isArray(roles) ? roles : [roles];
  const userRoleNames = userRoles
    .filter(ur => isRoleAssignmentCurrent(ur))
    .map(ur => ur.role?.name)
    .filter(Boolean);

  const hasRole = roleArray.some(role => userRoleNames.includes(role));

  if (hasRole) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Admin-only wrapper component
 */
export const IfAdmin: React.FC<{
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ children, fallback }) => {
  return (
    <IfPermission permission="admin:manage" fallback={fallback}>
      {children}
    </IfPermission>
  );
};

/**
 * Debug component for development - shows current user permissions
 */
export const PermissionDebugger: React.FC<{ className?: string }> = ({ className }) => {
  const { userRoles, effectivePermissions, isLoading } = useRBAC();

  if (isLoading) {
    return <div className={className}>Loading permissions...</div>;
  }

  return (
    <div className={`p-4 bg-muted text-foreground rounded-lg ${className || ''}`}>
      <h3 className="font-semibold mb-2">Permission Debug Info</h3>
      <div className="space-y-2 text-sm">
        <div>
          <strong>Roles:</strong> {userRoles.map(ur => ur.role?.name).join(', ') || 'None'}
        </div>
        <div>
          <strong>Permissions:</strong> {effectivePermissions.join(', ') || 'None'}
        </div>
      </div>
    </div>
  );
};

export default PermissionGuard;
