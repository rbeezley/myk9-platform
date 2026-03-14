import { User } from '@supabase/supabase-js';

/**
 * User role definitions matching the RBAC implementation plan
 */
export enum UserRole {
  SITE_ADMIN = 'site_admin',
  SECRETARY = 'secretary',
  JUDGE = 'judge',
  CLUB_ADMIN = 'club_admin',
  CHAIRMAN = 'chairman',
  STEWARD = 'steward',
  EXHIBITOR = 'exhibitor',
}

/**
 * Role hierarchy ordered by privilege (highest first).
 * Used for deriving effective role from a user's role set.
 */
export const USER_ROLE_HIERARCHY: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
  UserRole.EXHIBITOR,
];

/**
 * Scope types for role-based access control
 */
export enum ScopeType {
  CLUB = 'club',
  SHOW = 'show',
}

/**
 * Permission definitions following resource:action convention
 */
export const PERMISSIONS = {
  // Dog management
  DOG_CREATE: 'dog:create',
  DOG_READ: 'dog:read',
  DOG_UPDATE: 'dog:update',
  DOG_DELETE: 'dog:delete',
  DOG_READ_ALL: 'dog:read_all',

  // Registration management
  REGISTRATION_VIEW_ALL_DOGS: 'registration:view_all_dogs',
  REGISTRATION_REGISTER_ANY: 'registration:register_any',
  REGISTRATION_CREATE_EXHIBITOR: 'registration:create_exhibitor',
  REGISTRATION_OVERRIDE_FEES: 'registration:override_fees',
  REGISTRATION_ASSIGN_ARMBANDS: 'registration:assign_armbands',
  REGISTRATION_MANAGE_STATUS: 'registration:manage_status',
  REGISTRATION_BULK_OPERATIONS: 'registration:bulk_operations',

  // Show management
  SHOW_CREATE: 'show:create',
  SHOW_READ: 'show:read',
  SHOW_UPDATE: 'show:update',
  SHOW_DELETE: 'show:delete',
  SHOW_MANAGE: 'show:manage',
  SHOW_MANAGE_ENTRIES: 'show:manage_entries',

  // Judge permissions
  JUDGE_VIEW_ASSIGNMENTS: 'judge:view_assignments',
  JUDGE_ENTER_RESULTS: 'judge:enter_results',
  JUDGE_SIGN_RESULTS: 'judge:sign_results',
  JUDGE_VIEW_SCORESHEETS: 'judge:view_scoresheets',
  JUDGE_MANAGE_CHECK_IN: 'judge:manage_check_in',

  // Check-in management
  CHECK_IN_MANAGE_OWN: 'check_in:manage_own',
  CHECK_IN_MANAGE_ALL: 'check_in:manage_all',
  CHECK_IN_VIEW_ALL: 'check_in:view_all',

  // Admin permissions for impersonation and monitoring
  ADMIN_IMPERSONATE_USER: 'admin:impersonate_user',
  ADMIN_VIEW_AUDIT: 'admin:view_audit',
  ADMIN_MANAGE_USERS: 'admin:manage_users',
  ADMIN_VIEW_SYSTEM_HEALTH: 'admin:view_system_health',

  // Secretary permissions for coordination
  SECRETARY_ASSIGN_JUDGES: 'secretary:assign_judges',
  SECRETARY_BROADCAST_STATUS: 'secretary:broadcast_status',

  // Club management
  CLUB_CREATE: 'club:create',
  CLUB_READ: 'club:read',
  CLUB_UPDATE: 'club:update',
  CLUB_DELETE: 'club:delete',
  CLUB_EDIT_DETAILS: 'club:edit_details',
  CLUB_MANAGE_MEMBERS: 'club:manage_members',

  // User management
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_MANAGE_ROLES: 'user:manage_roles',

  // System administration
  SYSTEM_ADMIN: 'system:admin',
  SYSTEM_MANAGE_RBAC: 'system:manage_rbac',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Scope definition for scoped permissions
 */
export interface Scope {
  type: ScopeType;
  id: string;
}

/**
 * Role scope assignment (for Secretary and Club Admin roles)
 */
export interface RoleScope {
  userId: string;
  roleId: string;
  scopeType: ScopeType;
  scopeId: string;
  createdAt: Date;
  assignedAt?: Date;
  assignedBy?: string;
}

/**
 * Enhanced user interface with RBAC information
 */
export interface UserWithRoles extends User {
  roles: UserRole[];
  permissions: Permission[];
  scopes: RoleScope[];
  databaseUserId?: string; // The id from the user table (for foreign key references)
}

/**
 * Permission check function signature
 */
export type PermissionChecker = (permission: Permission, scope?: Scope) => boolean;

/**
 * RBAC context state
 */
export interface RBACContextState {
  user: UserWithRoles | null;
  loading: boolean;
  roles: UserRole[];
  permissions: Permission[];
  scopes: RoleScope[];
  can: PermissionChecker;
  hasRole: (role: UserRole) => boolean;
  hasScope: (scopeType: ScopeType, scopeId: string) => boolean;
  getScopedClubs: () => string[];
  refreshPermissions: () => Promise<void>;
}

/**
 * Default permission mappings for each role
 * This can be used as fallback when database-driven RBAC is not available
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.EXHIBITOR]: [
    PERMISSIONS.DOG_CREATE,
    PERMISSIONS.DOG_READ,
    PERMISSIONS.DOG_UPDATE,
    PERMISSIONS.DOG_DELETE,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.CLUB_READ,
  ],
  [UserRole.SECRETARY]: [
    PERMISSIONS.DOG_READ,
    PERMISSIONS.DOG_READ_ALL,
    PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS,
    PERMISSIONS.REGISTRATION_REGISTER_ANY,
    PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS,
    PERMISSIONS.REGISTRATION_MANAGE_STATUS,
    PERMISSIONS.REGISTRATION_BULK_OPERATIONS,
    PERMISSIONS.SECRETARY_ASSIGN_JUDGES,
    PERMISSIONS.SECRETARY_BROADCAST_STATUS,
    PERMISSIONS.CHECK_IN_MANAGE_ALL,
    PERMISSIONS.CHECK_IN_VIEW_ALL,
    PERMISSIONS.SHOW_CREATE,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.SHOW_UPDATE,
    PERMISSIONS.SHOW_DELETE,
    PERMISSIONS.SHOW_MANAGE,
    PERMISSIONS.SHOW_MANAGE_ENTRIES,
    PERMISSIONS.CLUB_READ,
  ],
  [UserRole.JUDGE]: [
    PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS,
    PERMISSIONS.JUDGE_ENTER_RESULTS,
    PERMISSIONS.JUDGE_SIGN_RESULTS,
    PERMISSIONS.JUDGE_VIEW_SCORESHEETS,
    PERMISSIONS.JUDGE_MANAGE_CHECK_IN,
    PERMISSIONS.CHECK_IN_MANAGE_ALL,
    PERMISSIONS.CHECK_IN_VIEW_ALL,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.CLUB_READ,
  ],
  [UserRole.STEWARD]: [
    PERMISSIONS.CHECK_IN_MANAGE_ALL,
    PERMISSIONS.CHECK_IN_VIEW_ALL,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.CLUB_READ,
  ],
  [UserRole.CHAIRMAN]: [
    PERMISSIONS.DOG_CREATE,
    PERMISSIONS.DOG_READ,
    PERMISSIONS.DOG_UPDATE,
    PERMISSIONS.DOG_DELETE,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.CLUB_READ,
  ],
  [UserRole.CLUB_ADMIN]: [
    PERMISSIONS.DOG_READ,
    PERMISSIONS.DOG_READ_ALL,
    PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS,
    PERMISSIONS.REGISTRATION_REGISTER_ANY,
    PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR,
    PERMISSIONS.REGISTRATION_OVERRIDE_FEES,
    PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS,
    PERMISSIONS.REGISTRATION_MANAGE_STATUS,
    PERMISSIONS.REGISTRATION_BULK_OPERATIONS,
    PERMISSIONS.SECRETARY_ASSIGN_JUDGES,
    PERMISSIONS.SECRETARY_BROADCAST_STATUS,
    PERMISSIONS.SHOW_CREATE,
    PERMISSIONS.SHOW_READ,
    PERMISSIONS.SHOW_UPDATE,
    PERMISSIONS.SHOW_DELETE,
    PERMISSIONS.SHOW_MANAGE,
    PERMISSIONS.SHOW_MANAGE_ENTRIES,
    PERMISSIONS.CLUB_READ,
    PERMISSIONS.CLUB_UPDATE,
    PERMISSIONS.CLUB_EDIT_DETAILS,
    PERMISSIONS.CLUB_MANAGE_MEMBERS,
    PERMISSIONS.USER_READ,
  ],
  [UserRole.SITE_ADMIN]: [...Object.values(PERMISSIONS)],
};

/**
 * Mock user data for development and testing
 */
export const MOCK_USERS: Record<string, UserWithRoles> = {
  'exhibitor-user': {
    // Required User properties
    id: 'exhibitor-user',
    aud: 'authenticated',
    email: 'exhibitor@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.EXHIBITOR],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR],
    scopes: [],
  },

  'secretary-user': {
    // Required User properties
    id: 'secretary-user',
    aud: 'authenticated',
    email: 'secretary@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.SECRETARY],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.SECRETARY],
    scopes: [
      {
        userId: 'secretary-user',
        roleId: 'secretary',
        scopeType: ScopeType.CLUB,
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  },

  'club-admin-user': {
    // Required User properties
    id: 'club-admin-user',
    aud: 'authenticated',
    email: 'clubadmin@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.CLUB_ADMIN],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.CLUB_ADMIN],
    scopes: [
      {
        userId: 'club-admin-user',
        roleId: 'club_admin',
        scopeType: ScopeType.CLUB,
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  },

  'judge-user': {
    // Required User properties
    id: 'judge-user',
    aud: 'authenticated',
    email: 'judge@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.JUDGE],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.JUDGE],
    scopes: [],
  },

  'site-admin-user': {
    // Required User properties
    id: 'site-admin-user',
    aud: 'authenticated',
    email: 'admin@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.SITE_ADMIN],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN],
    scopes: [],
  },

  'test-admin-user': {
    // Required User properties
    id: 'test-admin-user',
    aud: 'authenticated',
    email: 'testuser@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.SITE_ADMIN],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN],
    scopes: [],
  },

  'dev-user': {
    // Required User properties
    id: 'dev-user',
    aud: 'authenticated',
    email: 'dev@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.SECRETARY, UserRole.SITE_ADMIN],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN],
    scopes: [
      {
        userId: 'dev-user',
        roleId: 'secretary',
        scopeType: ScopeType.CLUB,
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  },

  'test-secretary-user': {
    // Required User properties
    id: 'test-secretary-user',
    aud: 'authenticated',
    email: 'testsecretary@example.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // RBAC properties
    roles: [UserRole.SECRETARY],
    permissions: DEFAULT_ROLE_PERMISSIONS[UserRole.SECRETARY],
    scopes: [
      {
        userId: 'test-secretary-user',
        roleId: 'secretary',
        scopeType: ScopeType.CLUB,
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  },
};
