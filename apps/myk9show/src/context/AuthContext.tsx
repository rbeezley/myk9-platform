/**
 * Consolidated Auth Context
 *
 * Combines all auth functionality:
 * - Basic authentication (signIn, signOut, etc.)
 * - Role-based access control (RBAC)
 * - Mock user support for development
 * - Database-driven permissions via RBACService
 * - Admin functions for role management
 */

import React, { createContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  UserWithRoles,
  UserRole,
  Permission,
  Scope,
  ScopeType,
  MOCK_USERS,
  DEFAULT_ROLE_PERMISSIONS,
  USER_ROLE_HIERARCHY,
} from '../types/auth-types';
import { ProtectedRouteProps, ConvenienceRouteProps } from './authUtils';
import { rbacService } from '@/services/rbac/RBACService';
import { ensureError } from '@myk9/core';
import { notifications } from '@/lib/notifications';

// Type for user role with details from RBAC service
interface UserRoleWithDetails {
  role_id: string;
  role?: {
    name?: string;
    display_name?: string;
  };
  scope_type?: string | null;
  scope_id?: string | null;
  assigned_at?: string;
  is_active: boolean;
}

/**
 * Determine the primary (highest-privilege) role from a set of roles.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getPrimaryRole(roles: UserRole[]): UserRole {
  for (const role of USER_ROLE_HIERARCHY) {
    if (roles.includes(role)) return role;
  }
  return UserRole.EXHIBITOR;
}

/**
 * Unified Auth Context Type
 * Combines original auth + RBAC + enhanced features
 */
export interface AuthContextType {
  // Original auth properties
  user: User | null;
  userWithRoles: UserWithRoles | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata?: { firstName?: string; lastName?: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (updates: {
    email?: string;
    password?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;

  // RBAC methods
  hasRole: (role: UserRole | string) => boolean;
  hasPermission: (
    permission: Permission | string,
    scope?: Scope | { type: string; id: string }
  ) => boolean;
  getUserRoles: () => UserRole[];

  // Development testing
  switchUserRole: (email: string) => void;

  // Async permission checking (database-driven)
  checkPermissionAsync: (
    permission: string,
    scope?: { type: string; id: string }
  ) => Promise<boolean>;

  // Convenience role checks
  isAdmin: boolean;
  isSecretary: boolean;
  isExhibitor: boolean;
  isJudge: boolean;

  // Database-driven permissions state
  dbPermissions: string[];
  dbRoles: Array<{ id: string; name: string; display_name: string }>;
  rbacLoading: boolean;
  rbacError: string | null;

  // Admin functions (only available to admins)
  assignRole?: (
    userId: string,
    roleName: string,
    scope?: { type: string; id: string }
  ) => Promise<void>;
  revokeRole?: (
    userId: string,
    roleName: string,
    scope?: { type: string; id: string }
  ) => Promise<void>;

  // Cache management
  refreshPermissions: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Mock user state for development testing
  const [currentMockUser, setCurrentMockUser] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      return localStorage.getItem('dev-current-mock-user');
    }
    return null;
  });

  // Database RBAC state
  const [rbacData, setRbacData] = useState({
    userRoles: [] as UserRoleWithDetails[],
    effectivePermissions: [] as string[],
    isLoading: false,
    error: null as string | null,
  });

  // Get user profile data from public.people table
  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', auth.user?.id],
    queryFn: async () => {
      if (!auth.user?.id) return null;

      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name, email, status')
        .eq('auth_user_id', auth.user.id)
        .single();

      if (error) {
        logger.warn('Could not fetch user profile:', 'context', {}, ensureError(error));
        return null;
      }

      return data;
    },
    enabled: !!auth.user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Enforce account suspension — sign out if status is 'suspended'
  useEffect(() => {
    if (userProfile?.status === 'suspended') {
      logger.warn('Account suspended, signing out user', 'auth');
      notifications.error(
        'Your account has been suspended. Contact the administrator for assistance.'
      );
      supabase.auth.signOut();
    }
  }, [userProfile?.status]);

  // Load database RBAC data when user changes
  useEffect(() => {
    if (!auth.user?.id) {
      setRbacData({
        userRoles: [],
        effectivePermissions: [],
        isLoading: false,
        error: null,
      });
      return;
    }

    const loadRbacData = async () => {
      try {
        setRbacData(prev => ({ ...prev, isLoading: true, error: null }));
        const data = await rbacService.getUserPermissions(auth.user!.id);
        setRbacData({
          userRoles: data.roles.map((role: UserRoleWithDetails) => {
            const { scope_type, ...rest } = role;
            return {
              ...rest,
              ...(scope_type && { scope_type }),
            };
          }),
          effectivePermissions: data.effectivePermissions,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        logger.error('Failed to load RBAC data:', 'app', {}, ensureError(error));
        setRbacData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load permissions',
        }));
      }
    };

    loadRbacData();
  }, [auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-run when user ID changes, not on every auth object reference change

  // Build userWithRoles - priority: mock user > database RBAC > default exhibitor
  const userWithRoles = useMemo((): UserWithRoles | null => {
    if (!auth.user) return null;

    // Priority 0: Mock user for development testing
    if (import.meta.env.DEV && currentMockUser && MOCK_USERS[currentMockUser]) {
      return MOCK_USERS[currentMockUser];
    }

    // Priority 0.5: Match by email to mock users in dev
    if (import.meta.env.DEV) {
      const mockUser = Object.values(MOCK_USERS).find(u => u.email === auth.user?.email);
      if (mockUser) {
        return mockUser;
      }
    }

    // Priority 1: Database RBAC (from rbacService)
    if (rbacData.userRoles.length > 0) {
      const activeRoles = rbacData.userRoles
        .filter(ur => ur.is_active)
        .map(ur => ur.role?.name as UserRole)
        .filter(Boolean);

      return {
        ...auth.user,
        roles: activeRoles,
        permissions: rbacData.effectivePermissions as Permission[],
        scopes: rbacData.userRoles
          .filter(ur => ur.scope_type && ur.scope_id)
          .map(ur => ({
            userId: auth.user!.id,
            roleId: ur.role_id,
            scopeType: ur.scope_type! as ScopeType,
            scopeId: ur.scope_id!,
            createdAt: new Date(ur.assigned_at || Date.now()),
          })),
        databaseUserId: userProfile?.id,
      } as UserWithRoles;
    }

    // Default fallback: exhibitor role
    return {
      ...auth.user,
      roles: [UserRole.EXHIBITOR],
      permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR],
      scopes: [],
      databaseUserId: userProfile?.id,
    } as UserWithRoles;
  }, [auth.user, currentMockUser, rbacData, userProfile]);

  /**
   * Check if user has a specific role
   */
  const hasRole = (role: UserRole | string): boolean => {
    if (!userWithRoles) return false;

    // Check database RBAC roles (active only)
    if (rbacData.userRoles.length > 0) {
      return rbacData.userRoles.some(ur => ur.role?.name === role && ur.is_active);
    }

    // Fallback for mock users and default exhibitor
    return userWithRoles.roles.includes(role as UserRole);
  };

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (
    permission: Permission | string,
    scope?: Scope | { type: string; id: string }
  ): boolean => {
    if (!userWithRoles) return false;

    // Database-driven permission check
    if (rbacData.effectivePermissions.length > 0) {
      if (!rbacData.effectivePermissions.includes(permission as string)) {
        return false;
      }

      // Scope checking for database permissions
      if (scope && rbacData.userRoles.length > 0) {
        return rbacData.userRoles.some(
          ur =>
            ur.scope_type === (scope as { type: string }).type &&
            ur.scope_id === (scope as { id: string }).id &&
            ur.is_active
        );
      }

      return true;
    }

    // Fallback to permission checking from userWithRoles (mock users / default)
    if (!userWithRoles.permissions.includes(permission as Permission)) {
      return false;
    }

    if (scope && userWithRoles.scopes.length > 0) {
      return userWithRoles.scopes.some(
        s => s.scopeType === (scope as Scope).type && s.scopeId === (scope as Scope).id
      );
    }

    return true;
  };

  /**
   * Async permission checking (database-driven)
   */
  const checkPermissionAsync = async (
    permission: string,
    scope?: { type: string; id: string }
  ): Promise<boolean> => {
    if (!auth.user?.id) return false;
    return await rbacService.checkPermission(auth.user.id, permission, scope);
  };

  /**
   * Get all user roles
   */
  const getUserRoles = (): UserRole[] => {
    if (rbacData.userRoles.length > 0) {
      return rbacData.userRoles
        .filter(ur => ur.is_active)
        .map(ur => ur.role?.name as UserRole)
        .filter(Boolean);
    }
    return userWithRoles?.roles || [];
  };

  /**
   * Switch to a different mock user for testing (development only)
   */
  const switchUserRole = (email: string): void => {
    if (!import.meta.env.DEV) return;

    const mockUserKey = Object.keys(MOCK_USERS).find(key => MOCK_USERS[key].email === email);
    if (mockUserKey) {
      setCurrentMockUser(mockUserKey);
      localStorage.setItem('dev-current-mock-user', mockUserKey);
    }
  };

  /**
   * Refresh permissions from database
   */
  const refreshPermissions = async (): Promise<void> => {
    if (!auth.user?.id) return;

    try {
      const data = await rbacService.getUserPermissions(auth.user.id);
      setRbacData({
        userRoles: data.roles.map((role: UserRoleWithDetails) => {
          const { scope_type, ...rest } = role;
          return {
            ...rest,
            ...(scope_type && { scope_type }),
          };
        }),
        effectivePermissions: data.effectivePermissions,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      logger.error('Failed to refresh RBAC data:', 'app', {}, ensureError(error));
      setRbacData(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh permissions',
      }));
    }
  };

  // Convenience role checks
  const isAdmin = hasRole('site_admin') || hasRole(UserRole.SITE_ADMIN);
  const isSecretary = hasRole('secretary') || hasRole(UserRole.SECRETARY);
  const isExhibitor = hasRole('exhibitor') || hasRole(UserRole.EXHIBITOR);
  const isJudge = hasRole('judge') || hasRole(UserRole.JUDGE);

  // Admin functions (only available to admins)
  const assignRole = isAdmin
    ? async (
        userId: string,
        roleName: string,
        scope?: { type: string; id: string }
      ): Promise<void> => {
        await rbacService.assignRole({
          userId,
          roleName,
          scopeType: scope?.type,
          scopeId: scope?.id,
        });
      }
    : undefined;

  const revokeRole = isAdmin
    ? async (
        userId: string,
        roleName: string,
        scope?: { type: string; id: string }
      ): Promise<void> => {
        await rbacService.revokeRole({
          userId,
          roleName,
          scopeType: scope?.type,
          scopeId: scope?.id,
        });
      }
    : undefined;

  const value: AuthContextType = {
    ...auth,
    userWithRoles,
    loading: auth.loading || rbacData.isLoading,

    // RBAC methods
    hasRole,
    hasPermission,
    getUserRoles,

    // Development testing
    switchUserRole,

    // Async permission checking
    checkPermissionAsync,

    // Convenience role checks
    isAdmin,
    isSecretary,
    isExhibitor,
    isJudge,

    // Database state
    dbPermissions: rbacData.effectivePermissions,
    dbRoles: rbacData.userRoles.map(ur => ({
      id: ur.role_id,
      name: ur.role?.name || '',
      display_name: ur.role?.display_name || ur.role?.name || '',
    })),
    rbacLoading: rbacData.isLoading,
    rbacError: rbacData.error,

    // Admin functions
    ...(assignRole !== undefined && { assignRole }),
    ...(revokeRole !== undefined && { revokeRole }),

    // Cache management
    refreshPermissions,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Protected route component
export function ProtectedRoute({
  children,
  redirectTo = '/sign-in',
  requiredRole,
  requiredPermission,
  scope,
  fallback = (
    <div className="flex items-center justify-center min-h-screen p-4 text-gray-500">
      You don't have permission to access this page.
    </div>
  ),
}: ProtectedRouteProps) {
  const context = React.useContext(AuthContext);

  if (!context) {
    throw new Error('ProtectedRoute must be used within an AuthProvider');
  }

  const { user, loading, hasRole, hasPermission } = context;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div
          data-testid="loading-spinner"
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
        ></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check role requirements
  if (requiredRole) {
    const hasRequiredRole = Array.isArray(requiredRole)
      ? requiredRole.some(role => hasRole(role))
      : hasRole(requiredRole);

    if (!hasRequiredRole) {
      return <>{fallback}</>;
    }
  }

  // Check permission requirements
  if (requiredPermission && !hasPermission(requiredPermission, scope)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Convenience components for common route protection scenarios
export const ExhibitorRoute = ({ children, ...props }: ConvenienceRouteProps) => (
  <ProtectedRoute requiredRole={UserRole.EXHIBITOR} {...props}>
    {children}
  </ProtectedRoute>
);

export const SecretaryRoute = ({ children, ...props }: ConvenienceRouteProps) => (
  <ProtectedRoute
    requiredRole={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
    {...props}
  >
    {children}
  </ProtectedRoute>
);

export const ClubAdminRoute = ({ children, ...props }: ConvenienceRouteProps) => (
  <ProtectedRoute requiredRole={[UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]} {...props}>
    {children}
  </ProtectedRoute>
);

export const SiteAdminRoute = ({ children, ...props }: ConvenienceRouteProps) => (
  <ProtectedRoute requiredRole={UserRole.SITE_ADMIN} {...props}>
    {children}
  </ProtectedRoute>
);
