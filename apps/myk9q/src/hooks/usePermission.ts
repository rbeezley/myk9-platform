import { useAuth } from '../contexts/AuthContext';
import { UserPermissions, UserRole } from '../utils/auth';

/**
 * Hook for checking user permissions and roles
 * 
 * @example
 * const { hasPermission, hasRole, isAdmin } = usePermission();
 * 
 * if (hasPermission('canAccessScoresheet')) {
 *   // Show scoresheet button
 * }
 * 
 * if (hasRole(['admin', 'judge'])) {
 *   // Show judge-specific UI
 * }
 */
export const usePermission = () => {
  const { role, canAccess } = useAuth();

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    return canAccess(permission);
  };

  const hasRole = (allowedRoles: UserRole | UserRole[]): boolean => {
    if (!role) return false;
    
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(role);
    }
    
    return role === allowedRoles;
  };

  const isAdmin = (): boolean => {
    return role === 'admin';
  };

  const isJudge = (): boolean => {
    return role === 'judge';
  };

  const isSteward = (): boolean => {
    return role === 'steward';
  };

  const isExhibitor = (): boolean => {
    return role === 'exhibitor';
  };

  return {
    hasPermission,
    hasRole,
    isAdmin,
    isJudge,
    isSteward,
    isExhibitor,
    currentRole: role,
  };
};