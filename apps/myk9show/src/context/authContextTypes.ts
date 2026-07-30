import type { User } from '@supabase/supabase-js';
import type {
  Permission,
  Scope,
  UserRole,
  UserWithRoles,
} from '@/types/auth-types';
import type {
  PermissionWithRole,
  UserRoleWithDetails as RbacUserRoleWithDetails,
} from '@/types/rbac-types';

export interface UserRoleWithDetails {
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

export interface AuthContextType {
  user: User | null;
  userWithRoles: UserWithRoles | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata?: { firstName?: string; lastName?: string; roles?: string[] },
    captchaToken?: string,
    redirectTo?: string
  ) => Promise<void>;
  resendConfirmationEmail: (
    email: string,
    captchaToken?: string,
    redirectTo?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  resetPassword: (email: string, captchaToken?: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (updates: {
    email?: string;
    password?: string;
    data?: Record<string, unknown>;
  }) => Promise<void>;
  hasRole: (role: UserRole | string) => boolean;
  hasPermission: (
    permission: Permission | string,
    scope?: Scope | { type: string; id: string }
  ) => boolean;
  getUserRoles: () => UserRole[];
  switchUserRole: (email: string) => void;
  checkPermissionAsync: (
    permission: string,
    scope?: { type: string; id: string }
  ) => Promise<boolean>;
  isAdmin: boolean;
  isSecretary: boolean;
  isExhibitor: boolean;
  isJudge: boolean;
  dbPermissions: string[];
  dbRoles: Array<{ id: string; name: string; display_name: string }>;
  rbacUserRoles: RbacUserRoleWithDetails[];
  /** Direct grant details for RBAC UI; authorization uses effective permission scopes. */
  rbacScopedPermissions: PermissionWithRole[];
  rbacLoading: boolean;
  rbacError: string | null;
  rbacLastRefreshed: string | null;
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
  refreshPermissions: () => Promise<void>;
  firstName: string | null;
  lastName: string | null;
}
