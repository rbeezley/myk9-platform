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
}

// Convenience route component props
export type ConvenienceRouteProps = Omit<ProtectedRouteProps, 'requiredRole'>;

