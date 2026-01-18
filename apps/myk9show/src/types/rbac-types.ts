/**
 * RBAC System TypeScript Types
 * Phase 2: Database-Driven Permissions
 * Created: December 2024
 */

// Database table types
export interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  permission_count?: number;
  user_count?: number;
}

export interface Permission {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  resource: string;
  action: string;
  is_system: boolean;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  granted_by?: string;
  granted_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  scope_type?: string | null;
  scope_id?: string | null;
  assigned_by?: string;
  assigned_at: string;
  expires_at?: string | null;
  is_active: boolean;
  user_email?: string;
  role?: Role;
  assigned_by_email?: string;
}

export interface PermissionAuditLog {
  id: string;
  action_type: string;
  actor_id?: string;
  actor_email?: string;
  target_role_id?: string;
  target_role_name?: string;
  target_permission_id?: string;
  target_permission_name?: string;
  target_user_id?: string;
  target_user_email?: string;
  scope_type?: string;
  scope_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// Extended types with joins
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface UserRoleWithDetails extends UserRole {
  role: Role;
  assigned_by_user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface PermissionWithRole {
  permission_name: string;
  permission_display_name: string;
  resource: string;
  action: string;
  role_name: string;
  role_display_name: string;
  scope_type?: string;
  scope_id?: string;
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
  actor?: {
    id: string;
    email: string;
    name?: string;
  };
  target_user?: {
    id: string;
    email: string;
    name?: string;
  };
  target_role?: {
    id: string;
    name: string;
    display_name: string;
  };
  target_permission?: {
    id: string;
    name: string;
    display_name: string;
  };
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