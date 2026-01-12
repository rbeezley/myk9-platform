/**
 * Enhanced Permission Guard Component
 * Phase 2.5: Database-driven permission checking
 * Created: December 2024
 */

import React, { ReactNode, useEffect, useState } from 'react';
import { useRBAC, usePermission } from '@/hooks/useRBAC';
import { Lock, Loader2 } from 'lucide-react';
// AlertCircle not used
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';

interface PermissionGuardProps {
  children: ReactNode;
  permission: string;
  scope?: {
    type: string;
    id: string;
  };
  fallback?: ReactNode;
  showFallback?: boolean;
  requireAll?: string[]; // Require all these permissions
  requireAny?: string[]; // Require any of these permissions
  roles?: string[]; // Alternative: check for specific roles
  onPermissionDenied?: () => void;
  loading?: ReactNode;
  className?: string;
}

/**
 * Enhanced PermissionGuard that supports:
 * - Single permission checking
 * - Multiple permission checking (all or any)
 * - Role-based checking
 * - Scoped permissions
 * - Custom fallbacks
 * - Loading states
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
  className
}) => {
  const { hasPermission, userRoles, isLoading: rbacLoading } = useRBAC();
  const { 
    // hasPermission: singlePermissionCheck, // Not used
    isLoading: singlePermissionLoading 
  } = usePermission(permission, scope);

  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      setIsChecking(true);

      try {
        let granted = false;

        // Single permission check
        if (permission && !requireAll && !requireAny && !roles) {
          granted = hasPermission(permission, scope);
        }

        // Multiple permissions - require all
        if (requireAll && requireAll.length > 0) {
          granted = requireAll.every(perm => hasPermission(perm, scope));
        }

        // Multiple permissions - require any
        if (requireAny && requireAny.length > 0) {
          granted = requireAny.some(perm => hasPermission(perm, scope));
        }

        // Role-based checking
        if (roles && roles.length > 0) {
          const userRoleNames = userRoles
            .filter(ur => ur.is_active)
            .map(ur => ur.role?.name)
            .filter(Boolean);
          
          granted = roles.some(role => userRoleNames.includes(role));
        }

        setHasAccess(granted);

        // Callback for permission denied
        if (!granted && onPermissionDenied) {
          onPermissionDenied();
        }
      } catch (error) {
        logger.error('Permission check failed:', 'components', {}, error as Error);
        setHasAccess(false);
      } finally {
        setIsChecking(false);
      }
    };

    if (!rbacLoading) {
      checkPermissions();
    }
  }, [
    permission,
    scope,
    requireAll,
    requireAny,
    roles,
    hasPermission,
    userRoles,
    rbacLoading,
    onPermissionDenied
  ]);

  // Show loading state
  if (rbacLoading || isChecking || singlePermissionLoading) {
    if (loading) {
      return <>{loading}</>;
    }

    return (
      <div className={`flex items-center justify-center p-4 ${className || ''}`}>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Checking permissions...</span>
      </div>
    );
  }

  // Permission granted - render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // Permission denied - show fallback or nothing
  if (!showFallback) {
    return null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  // Default permission denied message
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
    .filter(ur => ur.is_active)
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
    <div className={`p-4 bg-gray-100 rounded-lg ${className || ''}`}>
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