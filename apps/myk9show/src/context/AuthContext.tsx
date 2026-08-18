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

import React, { createContext, ReactNode, useCallback, useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  UserWithRoles,
  UserRole,
  Permission,
  Scope,
  MOCK_USERS,
  DEFAULT_ROLE_PERMISSIONS,
} from '../types/auth-types';
import { ProtectedRouteProps, ConvenienceRouteProps } from './authUtils';
import { useResetSavedViewsOnAccountChange } from '@/features/operational-views/useResetSavedViewsOnAccountChange';
import { useResetRecentSearchesOnAccountChange } from '@/hooks/useResetRecentSearchesOnAccountChange';
import { ensureError } from '@myk9/core';
import { notifications } from '@/lib/notifications';
import { buildSignInPathForRedirect } from '@/pages/SignInPage.helpers';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import type { AuthContextType } from './authContextTypes';
import {
  buildActiveRoleScopes,
  buildDevUserWithMockRoles,
  DEV_AUTH_ROLE_ALIASES,
  getUniqueActiveRoleNames,
} from './authContextHelpers';
import { toDbRoles, useRbacAdminActions, useRbacLifecycle } from './useRbacLifecycle';
import { useClassHideCacheBoundary } from '@/services/replication/useClassHideCacheBoundary';

export type { AuthContextType, UserRoleWithDetails } from './authContextTypes';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const {
    belongsToCurrentUser: rbacBelongsToCurrentUser,
    userRoles: currentRbacRoles,
    effectivePermissions: currentEffectivePermissions,
    effectivePermissionScopes: currentEffectivePermissionScopes,
    scopedPermissions: currentScopedPermissions,
    isLoading: rbacIsLoading,
    loaded: rbacLoaded,
    error: rbacError,
    lastRefreshed: rbacLastRefreshed,
    fromCacheAt: rbacFromCacheAt,
    refreshPermissions,
    checkPermissionAsync,
  } = useRbacLifecycle(auth.user?.id);

  // Personal saved views (operational-views-and-display-presets, tasks.md
  // 3.3) are device-local and namespaced by user id — clear the PRIOR user's
  // entries whenever the authenticated user id changes (including sign-out)
  // so a shared device never lists/restores another account's saved view.
  useResetSavedViewsOnAccountChange(auth.user?.id);

  // Recent command-palette searches (context-aware-command-menu, design.md
  // Decision 4) are device-local and namespaced by user id — clear the
  // PRIOR user's entries whenever the authenticated user id changes so a
  // shared device never lists/restores another account's recent searches.
  useResetRecentSearchesOnAccountChange(auth.user?.id);

  // Mock user state for development testing
  const [currentMockUser, setCurrentMockUser] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      return localStorage.getItem('dev-current-mock-user');
    }
    return null;
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
        .maybeSingle();

      if (error) {
        logger.warn('Could not fetch user profile', 'context', {
          code: error.code,
          message: error.message,
        });
        return null;
      }

      return data;
    },
    enabled: !!auth.user?.id,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Poll every minute for suspension checks
  });

  // Enforce account suspension — sign out if status is 'suspended'
  useEffect(() => {
    if (userProfile?.status === 'suspended') {
      logger.warn('Account suspended, signing out user', 'auth');
      notifications.error(
        'Your account has been suspended. Contact the administrator for assistance.'
      );
      supabase.auth
        .signOut()
        .catch(err => {
          logger.error('Failed to sign out suspended user', 'auth', {}, ensureError(err));
        })
        .finally(() => {
          window.location.href = '/sign-in';
        });
    }
  }, [userProfile?.status]);

  // Build userWithRoles - priority: mock user > database RBAC > default exhibitor
  // Deps use primitive/stable values (IDs, not object references) to avoid re-creating
  // this object when Supabase returns a new User reference for the same identity.
  const userWithRoles = useMemo((): UserWithRoles | null => {
    if (!auth.user) return null;

    // Priority 0: Mock user for development testing
    if (import.meta.env.DEV && currentMockUser && MOCK_USERS[currentMockUser]) {
      return buildDevUserWithMockRoles(auth.user, MOCK_USERS[currentMockUser], userProfile?.id);
    }

    // Priority 1: Database RBAC (from rbacService) — only use once loaded.
    // A load/refresh error does NOT discard roles already in memory (warm-path
    // offline preservation and cold-boot cache hydration, MYK9-200): stale
    // roles are advisory UI state and RLS still enforces server-side. The
    // error only blocks this branch when there are no roles to fall back on —
    // never grant the default-exhibitor role from an error state.
    if (rbacBelongsToCurrentUser && rbacLoaded) {
      const activeRoles = getUniqueActiveRoleNames(currentRbacRoles);

      if (!rbacError || activeRoles.length > 0) {
        // If RBAC loaded but user has no valid roles, grant exhibitor as default
        const roles = activeRoles.length > 0 ? activeRoles : [UserRole.EXHIBITOR];
        const permissions =
          activeRoles.length > 0
            ? (currentEffectivePermissions as Permission[])
            : DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR];

        return {
          ...auth.user,
          roles,
          permissions,
          scopes: buildActiveRoleScopes(currentRbacRoles, auth.user.id),
          databaseUserId: userProfile?.id,
        } as UserWithRoles;
      }
    }

    // Priority 2: Known seeded local/UAT accounts should keep their intended
    // staff role only while local RBAC is still loading or temporarily unavailable.
    // Once DB RBAC loads, its real scopes must win so secretary dashboards filter
    // by the clubs actually assigned in the database instead of mock "club-1".
    if (import.meta.env.DEV && auth.user.email) {
      const aliasKey = DEV_AUTH_ROLE_ALIASES[auth.user.email.toLowerCase()];
      if (aliasKey) {
        return buildDevUserWithMockRoles(auth.user, MOCK_USERS[aliasKey], userProfile?.id);
      }
    }

    // Priority 3: Match by email to mock users in dev
    if (import.meta.env.DEV) {
      const mockUser = Object.values(MOCK_USERS).find(u => u.email === auth.user?.email);
      if (mockUser) {
        return mockUser;
      }
    }

    // RBAC not yet loaded (or failed) — return null to keep loading state
    // The RBAC loading flag prevents ProtectedRoute from showing fallback
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auth.user?.id,
    auth.user?.email,
    currentMockUser,
    currentEffectivePermissions,
    currentRbacRoles,
    rbacBelongsToCurrentUser,
    rbacError,
    rbacLoaded,
    userProfile?.id,
  ]);

  const canReadHideCounts = userWithRoles
    ? userWithRoles.roles.some(role =>
        [
          UserRole.SITE_ADMIN,
          UserRole.SECRETARY,
          UserRole.JUDGE,
          UserRole.CLUB_ADMIN,
          UserRole.STEWARD,
        ].includes(role)
      )
    : null;

  useClassHideCacheBoundary({
    authReady: !auth.loading,
    userId: auth.user?.id ?? null,
    canReadHideCounts,
  });

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (role: UserRole | string): boolean => {
      if (!userWithRoles) return false;

      // Check database RBAC roles (active only)
      if (currentRbacRoles.length > 0) {
        return currentRbacRoles.some(ur => ur.role?.name === role && ur.is_active);
      }

      // Fallback for mock users and default exhibitor
      return userWithRoles.roles.includes(role as UserRole);
    },
    [currentRbacRoles, userWithRoles]
  );

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback(
    (permission: Permission | string, scope?: Scope | { type: string; id: string }): boolean => {
      if (!userWithRoles) return false;

      const permCode = permission as string;

      // Database-driven permission check
      if (currentEffectivePermissions.length > 0) {
        if (!currentEffectivePermissions.includes(permCode)) {
          return false;
        }

        // When a scope is provided, verify THIS permission is granted at THIS scope
        // or granted globally (global grants satisfy any scope check)
        if (scope) {
          const scopeType = (scope as { type: string }).type;
          const scopeId = (scope as { id: string }).id;
          return currentEffectivePermissionScopes.some(
            sp =>
              sp.permission_code === permCode &&
              (sp.scope_type === 'global' ||
                (sp.scope_type === scopeType && sp.scope_id === scopeId))
          );
        }

        return true;
      }

      // Fallback to permission checking from userWithRoles (mock users / default)
      if (!userWithRoles.permissions.includes(permission as Permission)) {
        return false;
      }

      // When a scope is provided, always require a matching scoped entry
      if (scope) {
        return userWithRoles.scopes.some(
          s => s.scopeType === (scope as Scope).type && s.scopeId === (scope as Scope).id
        );
      }

      return true;
    },
    [currentEffectivePermissionScopes, currentEffectivePermissions, userWithRoles]
  );

  /**
   * Get all user roles
   */
  const getUserRoles = useCallback((): UserRole[] => {
    if (currentRbacRoles.length > 0) {
      return getUniqueActiveRoleNames(currentRbacRoles);
    }
    return userWithRoles?.roles || [];
  }, [currentRbacRoles, userWithRoles]);

  /**
   * Switch to a different mock user for testing (development only)
   */
  const switchUserRole = useCallback((email: string): void => {
    if (!import.meta.env.DEV) return;

    const mockUserKey = Object.keys(MOCK_USERS).find(key => MOCK_USERS[key].email === email);
    if (mockUserKey) {
      setCurrentMockUser(mockUserKey);
      localStorage.setItem('dev-current-mock-user', mockUserKey);
    }
  }, []);

  // Convenience role checks
  const isAdmin = hasRole(UserRole.SITE_ADMIN);
  const isSecretary = hasRole(UserRole.SECRETARY);
  const isExhibitor = hasRole(UserRole.EXHIBITOR);
  const isJudge = hasRole(UserRole.JUDGE);

  const { assignRole, revokeRole } = useRbacAdminActions(isAdmin, refreshPermissions);
  const dbRoles = useMemo(() => toDbRoles(currentRbacRoles), [currentRbacRoles]);

  const value: AuthContextType = useMemo(
    () => ({
      ...auth,
      userWithRoles,
      loading:
        auth.loading ||
        (!!auth.user && !rbacBelongsToCurrentUser) ||
        (rbacIsLoading && !userWithRoles),

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
      dbPermissions: currentEffectivePermissions,
      dbRoles,
      rbacUserRoles: currentRbacRoles,
      rbacScopedPermissions: currentScopedPermissions,
      rbacLoading: !!auth.user && (!rbacBelongsToCurrentUser || rbacIsLoading),
      rbacError: rbacBelongsToCurrentUser ? rbacError : null,
      rbacLastRefreshed: rbacBelongsToCurrentUser ? rbacLastRefreshed : null,
      rbacFromCacheAt: rbacBelongsToCurrentUser ? rbacFromCacheAt : null,

      // Admin functions
      ...(assignRole !== undefined && { assignRole }),
      ...(revokeRole !== undefined && { revokeRole }),

      // Cache management
      refreshPermissions,

      firstName: userProfile?.first_name ?? null,
      lastName: userProfile?.last_name ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      // Use auth.user and auth.loading instead of the whole auth object.
      // auth is a plain object literal recreated on every useAuth() call, so including it
      // as a dep would recreate the context value on every AuthProvider render.
      auth.user,
      auth.loading,
      userWithRoles,
      rbacBelongsToCurrentUser,
      rbacIsLoading,
      rbacError,
      rbacLastRefreshed,
      rbacFromCacheAt,
      currentEffectivePermissions,
      currentRbacRoles,
      currentScopedPermissions,
      hasRole,
      hasPermission,
      getUserRoles,
      switchUserRole,
      checkPermissionAsync,
      isAdmin,
      isSecretary,
      isExhibitor,
      isJudge,
      dbRoles,
      assignRole,
      revokeRole,
      refreshPermissions,
      userProfile?.first_name,
      userProfile?.last_name,
    ]
  );

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
  const location = useLocation();

  if (!context) {
    throw new Error('ProtectedRoute must be used within an AuthProvider');
  }

  const { user, loading, hasRole, hasPermission } = context;

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading protected page"
        data-testid="loading-skeleton"
        className="min-h-screen p-6"
      >
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!user) {
    const target =
      redirectTo === '/sign-in'
        ? buildSignInPathForRedirect(`${location.pathname}${location.search}${location.hash}`)
        : redirectTo;
    return <Navigate to={target} replace />;
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
