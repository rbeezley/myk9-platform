/**
 * RBAC System TypeScript Types
 * Phase 2: Database-Driven Permissions
 * Created: December 2024
 */

// Database table types — match actual Supabase schema
export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean | null;
  permissions: string[] | null;  // DB column: string array
  created_at: string | null;
  // Virtual fields (not in DB, computed by app)
  display_name?: string;
  is_active?: boolean;
  permission_count?: number;
  user_count?: number;
}

export interface Permission {
  id: string;
  code: string;         // DB column: unique permission code (e.g. "show:manage")
  name: string;         // DB column: human-readable name
  description: string | null;
  category: string | null;
  created_at: string | null;
  // Virtual fields (computed from code)
  display_name?: string;
  resource?: string;
  action?: string;
  is_system?: boolean;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  club_id: string | null;
  show_id: string | null;
  granted_by: string | null;
  granted_at: string | null;
  expires_at: string | null;
  // Virtual fields (computed by app or RPC)
  scope_type?: string;
  scope_id?: string | null;
  is_active?: boolean;
  user_email?: string;
  role?: Role;
  assigned_by_email?: string;
}

export interface PermissionAuditLog {
  id: string;
  action: string;
  user_id: string | null;
  target_id: string | null;
  target_type: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | null;
}

// Extended types with joins
export interface RoleWithPermissions extends Role {
  permissionList: Permission[];
}

export interface UserRoleWithDetails extends UserRole {
  role: Role;
  granted_by_user?: {
    id: string;
    email: string;
    name?: string;
  };
}

// Matches the return type of get_user_permissions RPC
export interface PermissionWithRole {
  permission_id: string;
  permission_code: string;
  permission_name: string;
  description: string | null;
  category: string | null;
  role_id: string;
  role_name: string;
  scope_type: string;
  scope_id: string | null;
}

// Service types
export interface PermissionCheck {
  permission: string;
  scope?: {
    type: string;
    id: string;
  };
}

export interface RoleAssignment {
  userId: string;
  roleName: string;
  scope?: {
    type: string;
    id: string;
  };
  expiresAt?: string;
  assignedBy?: string;
}

export interface PermissionCache {
  userId: string;
  permission: string;
  scope?: {
    type: string;
    id: string;
  };
  hasPermission: boolean;
  cachedAt: string;
  expiresAt: string;
}

// API request/response types
export interface AssignRoleRequest {
  userId: string;
  roleName?: string | undefined;
  roleId?: string | undefined;
  scopeType?: string | undefined;
  scopeId?: string | undefined;
  expiresAt?: string | undefined;
}

export interface RevokeRoleRequest {
  userId: string;
  roleName: string;
  scopeType?: string | undefined;
  scopeId?: string | undefined;
}

export interface CreateRoleRequest {
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  displayName?: string;
  description?: string;
  permissions?: string[];
}

export interface PermissionCheckRequest {
  permission: string;
  scopeType?: string;
  scopeId?: string;
}

export interface PermissionCheckResponse {
  hasPermission: boolean;
  cached: boolean;
  checkedAt: string;
}

export interface UserPermissionsResponse {
  permissions: PermissionWithRole[];
  roles: UserRoleWithDetails[];
  effectivePermissions: string[];
}

// Permission template types
export interface PermissionTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  category: 'system' | 'custom';
}

// Audit types
export interface AuditLogFilter {
  actionType?: string | undefined;
  actorId?: string | undefined;
  userId?: string | undefined;
  targetUserId?: string | undefined;
  targetRoleId?: string | undefined;
  targetPermissionId?: string | undefined;
  entityType?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface AuditLogEntry extends PermissionAuditLog {
  // Enriched fields (not in DB, added by app)
  actor_email?: string;
  target_display?: string;
}

// Enum types
export enum ActionType {
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',
  ROLE_CREATED = 'role_created',
  ROLE_UPDATED = 'role_updated',
  ROLE_DELETED = 'role_deleted',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  PERMISSION_CREATED = 'permission_created',
  PERMISSION_UPDATED = 'permission_updated',
  PERMISSION_DELETED = 'permission_deleted',
  PERMISSION_OVERRIDE_CREATED = 'permission_override_created',
  PERMISSION_OVERRIDE_REMOVED = 'permission_override_removed',
  SEED_DATA_CREATED = 'seed_data_created'
}

export enum ScopeType {
  GLOBAL = 'global',
  CLUB = 'club',
  SHOW = 'show'
}

export enum ResourceType {
  ADMIN = 'admin',
  USER = 'user',
  ROLE = 'role',
  SHOW = 'show',
  TRIAL = 'trial',
  CLASS = 'class',
  ENTRY = 'entry',
  DOG = 'dog',
  PEOPLE = 'people',
  CLUB = 'club',
  JUDGE = 'judge',
  REPORT = 'report',
  TEMPLATE = 'template'
}

export enum ActionName {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
  ASSIGN = 'assign',
  VIEW = 'view',
  GENERATE = 'generate',
  EXPORT = 'export'
}

// Error types
export class PermissionError extends Error {
  constructor(
    message: string,
    public permission: string,
    public userId?: string,
    public scope?: { type: string; id: string }
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}

export class RoleError extends Error {
  constructor(
    message: string,
    public roleName: string,
    public userId?: string
  ) {
    super(message);
    this.name = 'RoleError';
  }
}

// Utility types
export type PermissionString = `${ResourceType}:${ActionName}`;
export type ScopedPermission = {
  permission: PermissionString;
  scope?: {
    type: ScopeType;
    id: string;
  };
};

// Hook types
export interface UseRBACOptions {
  refreshInterval?: number;
  cacheTimeout?: number;
  enableRealTimeUpdates?: boolean;
}

export interface RBACContextValue {
  // Permission checking
  hasPermission: (permission: string, scope?: { type: string; id: string }) => boolean;
  checkPermission: (permission: string, scope?: { type: string; id: string }) => Promise<boolean>;
  
  // User roles
  userRoles: UserRoleWithDetails[];
  userPermissions: PermissionWithRole[];
  effectivePermissions: string[];
  
  // Admin functions (only for admin users)
  assignRole?: (request: AssignRoleRequest) => Promise<void>;
  revokeRole?: (request: RevokeRoleRequest) => Promise<void>;
  createRole?: (request: CreateRoleRequest) => Promise<Role>;
  updateRole?: (roleId: string, request: UpdateRoleRequest) => Promise<Role>;
  
  // State
  isLoading: boolean;
  error: string | null;
  lastRefreshed: string | null;
  
  // Actions
  refresh: () => Promise<void>;
  clearCache: () => void;
}

// Constants
export const SYSTEM_ROLES = {
  SITE_ADMIN: 'site_admin',
  SECRETARY: 'secretary',
  EXHIBITOR: 'exhibitor',
  JUDGE: 'judge'
} as const;

export const PERMISSION_TEMPLATES: Record<string, PermissionTemplate> = {
  'basic-secretary': {
    id: 'basic-secretary',
    name: 'basic-secretary',
    displayName: 'Basic Secretary',
    description: 'Standard secretary permissions for show management',
    category: 'system',
    permissions: [
      'show:create', 'show:read', 'show:update', 'show:delete', 'show:manage',
      'trial:create', 'trial:read', 'trial:update', 'trial:delete', 'trial:manage',
      'class:create', 'class:read', 'class:update', 'class:delete', 'class:manage',
      'entry:read', 'entry:update', 'entry:manage',
      'judge:assign', 'judge:view', 'judge:manage',
      'report:generate', 'report:export',
      'template:create', 'template:read', 'template:update', 'template:delete', 'template:manage'
    ]
  },
  'show-manager': {
    id: 'show-manager',
    name: 'show-manager',
    displayName: 'Show Manager',
    description: 'Full show management capabilities',
    category: 'system',
    permissions: [
      'show:manage', 'trial:manage', 'class:manage',
      'entry:manage', 'judge:manage', 'report:manage'
    ]
  },
  'read-only-admin': {
    id: 'read-only-admin',
    name: 'read-only-admin',
    displayName: 'Read-Only Administrator',
    description: 'Can view but not modify data',
    category: 'system',
    permissions: [
      'admin:view', 'show:read', 'trial:read', 'class:read',
      'entry:read', 'dog:read', 'people:read', 'club:read',
      'report:generate', 'template:read'
    ]
  }
};