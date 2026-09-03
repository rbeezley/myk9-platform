import { ReactNode } from 'react';
import { useRegistrationPermissions } from '../../hooks/useRegistrationPermissions';
import { Permission, UserRole, Scope } from '../../types/auth-types';

/**
 * Props for the PermissionGuard component
 */
interface PermissionGuardProps {
  /** The children to render if permission check passes */
  children: ReactNode;
  
  /** The permission to check */
  permission?: Permission;
  
  /** Required role(s) */
  role?: UserRole | UserRole[];
  
  /** Scope for scoped permissions */
  scope?: Scope;
  
  /** Whether all permissions/roles must be satisfied (AND) or just one (OR) */
  requireAll?: boolean;
  
  /** Fallback content to render if permission check fails */
  fallback?: ReactNode;
  
  /** Whether to render nothing (null) if permission fails (overrides fallback) */
  renderNothing?: boolean;
  
  /** Custom permission check function */
  customCheck?: () => boolean;
  
  /** Invert the permission check (useful for "hide if user can do X") */
  not?: boolean;
}

/**
 * Component that conditionally renders children based on user permissions
 * 
 * @example
 * ```tsx
 * // Basic permission check
 * <PermissionGuard permission={PERMISSIONS.DOG_CREATE}>
 *   <Button>Add Dog</Button>
 * </PermissionGuard>
 * 
 * // Role-based check
 * <PermissionGuard role={UserRole.SECRETARY}>
 *   <SecretaryPanel />
 * </PermissionGuard>
 * 
 * // Multiple roles (OR)
 * <PermissionGuard role={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]}>
 *   <AdminFeatures />
 * </PermissionGuard>
 * 
 * // Scoped permission
 * <PermissionGuard 
 *   permission={PERMISSIONS.CLUB_MANAGE}
 *   scope={{ type: ScopeType.CLUB, id: clubId }}
 * >
 *   <ClubEditForm />
 * </PermissionGuard>
 * 
 * // With fallback content
 * <PermissionGuard 
 *   permission={PERMISSIONS.DOG_CREATE}
 *   fallback={<div>You don't have permission to create dogs</div>}
 * >
 *   <AddDogButton />
 * </PermissionGuard>
 * 
 * // Custom check
 * <PermissionGuard customCheck={() => user.isVerified}>
 *   <VerifiedUserFeatures />
 * </PermissionGuard>
 * 
 * // Inverted check (hide if user has permission)
 * <PermissionGuard permission={PERMISSIONS.DOG_CREATE} not>
 *   <div>You need permission to create dogs</div>
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({
  children,
  permission,
  role,
  scope,
  requireAll = false,
  fallback = null,
  renderNothing = false,
  customCheck,
  not = false
}: PermissionGuardProps) {
  const { can, hasRole } = useRegistrationPermissions();
  
  /**
   * Check if user has the required permission
   */
  const hasPermission = (): boolean => {
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
          // User must have ALL specified roles
          roleResult = role.every(r => hasRole(r));
        } else {
          // User must have at least ONE of the specified roles
          roleResult = role.some(r => hasRole(r));
        }
      } else {
        roleResult = hasRole(role);
      }
    }
    
    // Combine permission and role results
    if (permission && role) {
      return requireAll ? (permissionResult && roleResult) : (permissionResult || roleResult);
    }
    
    if (permission) return permissionResult;
    if (role) return roleResult;
    
    // If no permission or role specified, default to true
    return true;
  };
  
  const allowed = not ? !hasPermission() : hasPermission();
  
  if (allowed) {
    return <>{children}</>;
  }
  
  if (renderNothing) {
    return null;
  }
  
  return <>{fallback}</>;
}
