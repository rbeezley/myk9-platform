import React, { createContext, useState, ReactNode } from 'react';
import { RegistrationContext as RegistrationContextType } from '../types/show-registration-types';
import { 
  UserRole, 
  UserWithRoles, 
  PERMISSIONS, 
  Permission,
  Scope,
  ScopeType 
} from '../types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';

/**
 * Extended registration context with RBAC capabilities
 */
interface EnhancedRegistrationContext extends RegistrationContextType {
  // Permission checks
  canViewAllDogs: boolean;
  canRegisterAnyDog: boolean;
  canCreateExhibitor: boolean;
  canOverrideFees: boolean;
  canAssignArmbands: boolean;
  canManageStatus: boolean;
  canBulkOperations: boolean;
  
  // Role-based workflow configurations
  workflowConfig: WorkflowConfig;
  
  // Context management
  setContextForShow: (showId: string, clubId?: string) => void;
  switchRole: (role: UserRole) => void;
  resetContext: () => void;
}

import { WorkflowConfig, WORKFLOW_CONFIGS } from './registrationUtils';

// eslint-disable-next-line react-refresh/only-export-components
export const RegistrationContextProvider = createContext<EnhancedRegistrationContext | undefined>(undefined);

interface RegistrationProviderProps {
  children: ReactNode;
}

export function RegistrationProvider({ children }: RegistrationProviderProps) {
  const { user } = useAuthContext();
  const [context, setContext] = useState<RegistrationContextType | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  // Get user with roles (mock for now, will integrate with RBAC later)
  const userWithRoles = user as UserWithRoles | null;

  /**
   * Permission checker function
   */
  const can = (permission: Permission, scope?: Scope): boolean => {
    if (!userWithRoles || !userWithRoles.permissions) return false;
    
    // Check if user has the permission
    if (!userWithRoles.permissions.includes(permission)) {
      return false;
    }
    
    // For scoped permissions, check if user has access to the scope
    if (scope && userWithRoles.scopes && userWithRoles.scopes.length > 0) {
      return userWithRoles.scopes.some(s => 
        s.scopeType === scope.type && s.scopeId === scope.id
      );
    }
    
    return true;
  };

  /**
   * Get the appropriate workflow mode based on user role and context
   */
  const getRegistrationMode = (): RegistrationContextType['mode'] => {
    if (!userWithRoles || !currentRole) return 'exhibitor';
    
    switch (currentRole) {
      case UserRole.SITE_ADMIN:
      case UserRole.CLUB_ADMIN:
        return 'secretary_new'; // Full capabilities
      case UserRole.SECRETARY:
        return context?.mode === 'secretary_new' ? 'secretary_new' : 'secretary_existing';
      case UserRole.EXHIBITOR:
      default:
        return 'exhibitor';
    }
  };

  /**
   * Get workflow configuration based on current mode
   */
  const getWorkflowConfig = (): WorkflowConfig => {
    const mode = getRegistrationMode();
    return WORKFLOW_CONFIGS[mode] || WORKFLOW_CONFIGS.exhibitor;
  };

  /**
   * Set registration context for a specific show
   */
  const setContextForShow = (showId: string, clubId?: string) => {
    if (!userWithRoles) return;
    
    const mode = getRegistrationMode();
    const permissions = userWithRoles.permissions;
    const scopedClubs = clubId ? [clubId] : userWithRoles.scopes
      .filter(s => s.scopeType === ScopeType.CLUB)
      .map(s => s.scopeId);
    
    setContext({
      mode,
      permissions,
      scopedClubs,
      showId,
      userId: userWithRoles.id
    });
  };

  /**
   * Switch the current role (for users with multiple roles)
   */
  const switchRole = (role: UserRole) => {
    if (!userWithRoles || !userWithRoles.roles || !userWithRoles.roles.includes(role)) return;
    setCurrentRole(role);
  };

  /**
   * Reset the registration context
   */
  const resetContext = () => {
    setContext(null);
  };

  // Initialize role on user change using render-time sync
  const rolesKey = userWithRoles?.roles?.join(',') || 'none';
  const [prevRolesKey, setPrevRolesKey] = useState(rolesKey);
  if (rolesKey !== prevRolesKey) {
    setPrevRolesKey(rolesKey);
    if (userWithRoles?.roles && userWithRoles.roles.length > 0) {
      // Default to the highest privilege role
      const roleHierarchy = [UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN, UserRole.SECRETARY, UserRole.EXHIBITOR];
      const highestRole = roleHierarchy.find(role => userWithRoles.roles.includes(role));
      setCurrentRole(highestRole || UserRole.EXHIBITOR);
    } else {
      setCurrentRole(null);
    }
  }

  // Permission-based capabilities
  const canViewAllDogs = can(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);
  const canRegisterAnyDog = can(PERMISSIONS.REGISTRATION_REGISTER_ANY);
  const canCreateExhibitor = can(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR);
  const canOverrideFees = can(PERMISSIONS.REGISTRATION_OVERRIDE_FEES);
  const canAssignArmbands = can(PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS);
  const canManageStatus = can(PERMISSIONS.REGISTRATION_MANAGE_STATUS);
  const canBulkOperations = can(PERMISSIONS.REGISTRATION_BULK_OPERATIONS);

  const workflowConfig = getWorkflowConfig();

  const value: EnhancedRegistrationContext = {
    // Base context
    mode: context?.mode || 'exhibitor',
    permissions: context?.permissions || [],
    scopedClubs: context?.scopedClubs || [],
    showId: context?.showId || '',
    userId: context?.userId || '',
    
    // Permission checks
    canViewAllDogs,
    canRegisterAnyDog,
    canCreateExhibitor,
    canOverrideFees,
    canAssignArmbands,
    canManageStatus,
    canBulkOperations,
    
    // Workflow configuration
    workflowConfig,
    
    // Context management
    setContextForShow,
    switchRole,
    resetContext
  };

  return (
    <RegistrationContextProvider.Provider value={value}>
      {children}
    </RegistrationContextProvider.Provider>
  );
}


