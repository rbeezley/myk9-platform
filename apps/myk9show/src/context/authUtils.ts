import { ReactNode } from 'react';
import { UserRole, Permission, Scope } from '../types/auth-types';

// Type definitions for auth utility functions
export interface AuthUtilsType {
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: Permission, scope?: Scope) => boolean;
  getUserRoles: () => UserRole[];
  switchUserRole: (email: string) => void;
}

// Protected route component props
export interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission;
  scope?: Scope;
  fallback?: ReactNode;
  /**
   * Only a real signed-in account may enter: a ringside passcode session (an
   * anonymous auth user) is sent to sign-in like a signed-out guest, so an
   * account-only page never reads the device replica for it (MYK9-789). Off by
   * default, because some protected routes deliberately admit a passcode.
   */
  accountOnly?: boolean;
}

// Convenience route component props
export type ConvenienceRouteProps = Omit<ProtectedRouteProps, 'requiredRole'>;
