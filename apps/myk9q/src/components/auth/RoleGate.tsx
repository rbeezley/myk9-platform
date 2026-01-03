import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole, UserPermissions } from '../../utils/auth';

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: keyof UserPermissions;
  fallback?: React.ReactNode;
}

/**
 * Component that conditionally renders children based on user role/permissions
 * 
 * Examples:
 * <RoleGate allowedRoles={['admin', 'judge']}>
 *   <ScoresheetButton />
 * </RoleGate>
 * 
 * <RoleGate requiredPermission="canViewPasscodes">
 *   <PasscodeDisplay />
 * </RoleGate>
 */
export const RoleGate: React.FC<RoleGateProps> = ({
  children,
  allowedRoles,
  requiredPermission,
  fallback = null
}) => {
  const { role, canAccess } = useAuth();

  // Check role-based access
  if (allowedRoles && role) {
    if (!allowedRoles.includes(role)) {
      return <>{fallback}</>;
    }
  }

  // Check permission-based access
  if (requiredPermission) {
    if (!canAccess(requiredPermission)) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
};