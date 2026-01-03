import React, { createContext, ReactNode, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { useUserRoles, useUserRoleNames } from '@/hooks/queries/useUserRoles';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { 
  UserWithRoles, 
  UserRole, 
  Permission, 
  Scope,
  DEFAULT_ROLE_PERMISSIONS 
} from '../types/auth-types';
import { ProtectedRouteProps, ConvenienceRouteProps } from './authUtils';
import { useAuthContext } from '@/hooks/useAuthContext';
// import { useEnhancedAuth } from '@/hooks/useEnhancedAuth'; // Currently unused

interface AuthContextType {
  user: User | null;
  userWithRoles: UserWithRoles | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata?: { firstName?: string; lastName?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (updates: {
    email?: string;
    password?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;
  
  // RBAC methods
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: Permission, scope?: Scope) => boolean;
  getUserRoles: () => UserRole[];
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  // Get user roles from RBAC system (user_role table)
  const userRoles = useUserRoleNames(auth.user?.id);
  const { isLoading: rolesLoading } = useUserRoles(auth.user?.id);

  // Get user profile data including roles from public.user table
  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', auth.user?.id],
    queryFn: async () => {
      if (!auth.user?.id) return null;
      
      const { data, error } = await supabase
        .from('user')
        .select('id, roles, first_name, last_name, email')
        .eq('user_id', auth.user.id)
        .single();
      
      if (error) {
        console.warn('Could not fetch user profile:', error);
        return null;
      }
      
      return data;
    },
    enabled: !!auth.user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get user with roles from database - NO MOCK USERS
  const userWithRoles = useMemo((): UserWithRoles | null => {
    if (!auth.user) return null;
    
    console.log('🔍 AuthContext userWithRoles debug:', { 
      userId: auth.user.id.substring(0, 8) + '...', 
      userRoles: userRoles, 
      userProfile: userProfile 
    });
    
    // Priority 1: Use RBAC system for roles from user_role table
    if (userRoles.length > 0) {
      const allPermissions = userRoles.reduce((permissions, role) => {
        const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
        return [...permissions, ...rolePermissions];
      }, [] as Permission[]);

      console.log('✅ Using RBAC roles:', userRoles);
      return {
        ...auth.user,
        roles: userRoles,
        permissions: [...new Set(allPermissions)],
        scopes: [],
        databaseUserId: userProfile?.id
      } as UserWithRoles;
    }
    
    // Priority 2: Get roles from public.user.roles field 
    if (userProfile?.roles && Array.isArray(userProfile.roles) && userProfile.roles.length > 0) {
      const roles = userProfile.roles.map((role: string) => {
        switch (role.toLowerCase()) {
          case 'site_admin': return UserRole.SITE_ADMIN;
          case 'secretary': return UserRole.SECRETARY;
          case 'judge': return UserRole.JUDGE;
          case 'club_admin': return UserRole.CLUB_ADMIN;
          case 'exhibitor': return UserRole.EXHIBITOR;
          default: return UserRole.EXHIBITOR;
        }
      });

      const allPermissions = roles.reduce((permissions, role) => {
        const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
        return [...permissions, ...rolePermissions];
      }, [] as Permission[]);

      console.log('✅ Using user profile roles:', roles);
      return {
        ...auth.user,
        roles,
        permissions: [...new Set(allPermissions)],
        scopes: [],
        databaseUserId: userProfile?.id
      } as UserWithRoles;
    }
    
    // Final fallback: Default to exhibitor role
    console.log('⚠️ Using fallback exhibitor role - no RBAC or profile roles found');
    return {
      ...auth.user,
      roles: [UserRole.EXHIBITOR],
      permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR],
      scopes: [],
      databaseUserId: userProfile?.id
    } as UserWithRoles;
  }, [auth.user, userRoles, userProfile]);

  /**
   * Check if user has a specific role
   */
  const hasRole = (role: UserRole): boolean => {
    return userWithRoles?.roles.includes(role) || false;
  };

  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission: Permission, scope?: Scope): boolean => {
    if (!userWithRoles) return false;
    
    // Check if user has the permission
    if (!userWithRoles.permissions.includes(permission)) {
      return false;
    }
    
    // For scoped permissions, check if user has access to the scope
    if (scope && userWithRoles.scopes.length > 0) {
      return userWithRoles.scopes.some(s => 
        s.scopeType === scope.type && s.scopeId === scope.id
      );
    }
    
    return true;
  };

  /**
   * Get all user roles
   */
  const getUserRoles = (): UserRole[] => {
    return userWithRoles?.roles || [];
  };

  const value: AuthContextType = {
    ...auth,
    userWithRoles,
    loading: auth.loading || rolesLoading,
    hasRole,
    hasPermission,
    getUserRoles
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
  fallback = <div className="flex items-center justify-center min-h-screen p-4 text-gray-500">You don't have permission to access this page.</div>
}: ProtectedRouteProps) {
  // Use basic auth context for database authentication
  const { user, loading, hasRole, hasPermission } = useAuthContext();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div data-testid="loading-spinner" className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
  <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]} {...props}>
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