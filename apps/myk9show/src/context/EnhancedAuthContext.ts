/**
 * Enhanced Auth Context Definition
 * Separated from provider for Fast Refresh compatibility
 */

import { createContext } from 'react';
import { User } from '@supabase/supabase-js';
import { UserWithRoles } from '@/types/auth-types';

export interface EnhancedAuthContextType {
  // Original auth properties
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<void>;
  
  // Enhanced RBAC properties
  userWithRoles: UserWithRoles | null;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string, scope?: { type: string; id: string }) => boolean;
  checkPermissionAsync: (permission: string, scope?: { type: string; id: string }) => Promise<boolean>;
  getUserRoles: () => string[];
  
  // Convenience role checks
  isAdmin: boolean;
  isSecretary: boolean;
  isExhibitor: boolean;
  isJudge: boolean;
  
  // Database-driven permissions
  dbPermissions: string[];
  dbRoles: Array<{ id: string; name: string; display_name: string }>;
  rbacLoading: boolean;
  rbacError: string | null;
  
  // Admin functions
  assignRole?: (userId: string, roleName: string, scope?: { type: string; id: string }) => Promise<void>;
  revokeRole?: (userId: string, roleName: string, scope?: { type: string; id: string }) => Promise<void>;
  
  // Cache management
  refreshPermissions: () => Promise<void>;
}

export const EnhancedAuthContext = createContext<EnhancedAuthContextType | undefined>(undefined);