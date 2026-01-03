// import { useMemo } from 'react'; // Currently unused
import { useAuthContext } from '@/hooks/useAuthContext';
import { 
  Permission, 
  PERMISSIONS, 
  UserRole, 
  // UserWithRoles, // Currently unused
  Scope,
  ScopeType,
  // DEFAULT_ROLE_PERMISSIONS // Currently unused
} from '../types/auth-types';

/**
 * Registration-specific permission definitions
 */
export const REGISTRATION_PERMISSIONS = {
  VIEW_ALL_DOGS: PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS,
  REGISTER_ANY_DOG: PERMISSIONS.REGISTRATION_REGISTER_ANY,
  CREATE_EXHIBITOR: PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR,
  OVERRIDE_FEES: PERMISSIONS.REGISTRATION_OVERRIDE_FEES,
  ASSIGN_ARMBANDS: PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS,
  MANAGE_STATUS: PERMISSIONS.REGISTRATION_MANAGE_STATUS,
  BULK_OPERATIONS: PERMISSIONS.REGISTRATION_BULK_OPERATIONS,
  MARK_PAYMENT: 'registration:mark_payment' as Permission,
  ASSIGN_HANDLERS: 'registration:assign_handlers' as Permission,
  MANAGE_PAYMENTS: 'registration:manage_payments' as Permission,
} as const;

/**
 * Hook for checking registration-specific permissions
 */
export function useRegistrationPermissions() {
  const { userWithRoles } = useAuthContext();

  /**
   * Check if user has a specific permission
   */
  const can = (permission: Permission, scope?: Scope): boolean => {
    if (!userWithRoles) return false;
    
    // Check if user has the permission
    if (!userWithRoles.permissions.includes(permission)) {
      return false;
    }
    
    // For scoped permissions, check if user has access to the scope
    if (scope && userWithRoles.scopes.length > 0) {
      const scopedRoles = [UserRole.SECRETARY, UserRole.CLUB_ADMIN];
      const hasScope = userWithRoles.roles.some(role => scopedRoles.includes(role));
      
      if (hasScope) {
        return userWithRoles.scopes.some(s => 
          s.scopeType === scope.type && s.scopeId === scope.id
        );
      }
    }
    
    return true;
  };

  /**
   * Check if user has a specific role
   */
  const hasRole = (role: UserRole): boolean => {
    return userWithRoles?.roles.includes(role) || false;
  };

  /**
   * Check if user has scope access to a specific entity
   */
  const hasScope = (scopeType: ScopeType, scopeId: string): boolean => {
    if (!userWithRoles) return false;
    
    return userWithRoles.scopes.some(s => 
      s.scopeType === scopeType && s.scopeId === scopeId
    );
  };

  /**
   * Get all clubs the user has scope access to
   */
  const getScopedClubs = (): string[] => {
    if (!userWithRoles) return [];
    
    return userWithRoles.scopes
      .filter(s => s.scopeType === ScopeType.CLUB)
      .map(s => s.scopeId);
  };

  /**
   * Check if user can view all dogs (not just their own)
   */
  const canViewAllDogs = can(REGISTRATION_PERMISSIONS.VIEW_ALL_DOGS);

  /**
   * Check if user can register dogs for any user
   */
  const canRegisterAnyDog = can(REGISTRATION_PERMISSIONS.REGISTER_ANY_DOG);

  /**
   * Check if user can create new exhibitors
   */
  const canCreateExhibitor = can(REGISTRATION_PERMISSIONS.CREATE_EXHIBITOR);

  /**
   * Check if user can override fees
   */
  const canOverrideFees = can(REGISTRATION_PERMISSIONS.OVERRIDE_FEES);

  /**
   * Check if user can assign armbands
   */
  const canAssignArmbands = can(REGISTRATION_PERMISSIONS.ASSIGN_ARMBANDS);

  /**
   * Check if user can manage entry status
   */
  const canManageStatus = can(REGISTRATION_PERMISSIONS.MANAGE_STATUS);

  /**
   * Check if user can perform bulk operations
   */
  const canBulkOperations = can(REGISTRATION_PERMISSIONS.BULK_OPERATIONS);

  /**
   * Check if user can manage payments
   */
  const canManagePayments = can(REGISTRATION_PERMISSIONS.MANAGE_PAYMENTS);

  /**
   * Check if user can assign handlers to dogs
   */
  const canAssignHandlers = can(REGISTRATION_PERMISSIONS.ASSIGN_HANDLERS);

  /**
   * Check if user can perform registration operations for a specific show/club
   */
  const canRegisterForShow = (showId: string, clubId?: string): boolean => {
    if (!userWithRoles) return false;
    
    // Site admins can register for any show
    if (hasRole(UserRole.SITE_ADMIN)) return true;
    
    // If no club specified, check general registration permission
    if (!clubId) return canRegisterAnyDog;
    
    // Check scoped access for club-specific shows
    if (hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SECRETARY)) {
      return hasScope(ScopeType.CLUB, clubId);
    }
    
    // Exhibitors can register for any public show
    return hasRole(UserRole.EXHIBITOR);
  };

  /**
   * Get the maximum number of dogs user can register at once
   */
  const getMaxDogsPerRegistration = (): number => {
    if (hasRole(UserRole.SITE_ADMIN)) return 1000;
    if (hasRole(UserRole.CLUB_ADMIN)) return 100;
    if (hasRole(UserRole.SECRETARY)) return 50;
    return 5; // Exhibitor default
  };

  /**
   * Check if user can access advanced search features
   */
  const canUseAdvancedSearch = (): boolean => {
    return canViewAllDogs || hasRole(UserRole.SECRETARY) || hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SITE_ADMIN);
  };

  /**
   * Get registration workflow mode based on permissions
   */
  const getRegistrationMode = (): 'exhibitor' | 'secretary_existing' | 'secretary_new' => {
    if (!userWithRoles) return 'exhibitor';
    
    if (hasRole(UserRole.SITE_ADMIN) || hasRole(UserRole.CLUB_ADMIN)) {
      return 'secretary_new'; // Full capabilities
    }
    
    if (hasRole(UserRole.SECRETARY)) {
      return canCreateExhibitor ? 'secretary_new' : 'secretary_existing';
    }
    
    return 'exhibitor';
  };

  /**
   * Get user's highest privilege role
   */
  const getHighestRole = (): UserRole => {
    if (!userWithRoles) return UserRole.EXHIBITOR;
    
    const roleHierarchy = [
      UserRole.SITE_ADMIN,
      UserRole.CLUB_ADMIN, 
      UserRole.SECRETARY,
      UserRole.EXHIBITOR
    ];
    
    return roleHierarchy.find(role => userWithRoles.roles.includes(role)) || UserRole.EXHIBITOR;
  };

  /**
   * Filter dogs based on user permissions
   */
  const filterAccessibleDogs = <T extends { id: string; ownerId?: string; clubId?: string }>(dogs: T[]): T[] => {
    if (!userWithRoles) return [];
    
    // Site admins can see all dogs
    if (hasRole(UserRole.SITE_ADMIN)) return dogs;
    
    // Club admins and secretaries can see dogs within their scoped clubs
    if (hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SECRETARY)) {
      const scopedClubs = getScopedClubs();
      return dogs.filter(dog => 
        dog.ownerId === userWithRoles.id || // Own dogs
        (dog.clubId && scopedClubs.includes(dog.clubId)) // Club-scoped dogs
      );
    }
    
    // Exhibitors can only see their own dogs
    return dogs.filter(dog => dog.ownerId === userWithRoles.id);
  };

  return {
    // User info
    user: userWithRoles,
    roles: userWithRoles?.roles || [],
    permissions: userWithRoles?.permissions || [],
    scopes: userWithRoles?.scopes || [],
    
    // Permission checkers
    can,
    hasRole,
    hasScope,
    getScopedClubs,
    
    // Registration-specific permissions
    canViewAllDogs,
    canRegisterAnyDog,
    canCreateExhibitor,
    canOverrideFees,
    canAssignArmbands,
    canManageStatus,
    canBulkOperations,
    canManagePayments,
    canAssignHandlers,
    
    // Workflow helpers
    canRegisterForShow,
    getMaxDogsPerRegistration,
    canUseAdvancedSearch,
    getRegistrationMode,
    getHighestRole,
    filterAccessibleDogs,
    
    // Context info
    isExhibitor: hasRole(UserRole.EXHIBITOR),
    isSecretary: hasRole(UserRole.SECRETARY),
    isClubAdmin: hasRole(UserRole.CLUB_ADMIN),
    isSiteAdmin: hasRole(UserRole.SITE_ADMIN)
  };
}