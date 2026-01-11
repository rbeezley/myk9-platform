/**
 * RBAC Service
 *
 * Facade that provides a unified API for Role-Based Access Control.
 * Delegates to specialized modules for different concerns.
 */

import {
  Role,
  Permission,
  UserRole,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  UserPermissionsResponse,
  AuditLogFilter,
  AuditLogEntry,
  ActionType,
} from '@/types/rbac-types';
import { PermissionChecker } from './PermissionChecker';
import { RoleManager } from './RoleManager';
import { AuditLogger } from './AuditLogger';
import { SecurityValidator } from './SecurityValidator';

export class RBACService {
  private static instance: RBACService;

  private permissionChecker: PermissionChecker;
  private roleManager: RoleManager;
  private auditLogger: AuditLogger;
  private securityValidator: SecurityValidator;

  private constructor() {
    this.permissionChecker = new PermissionChecker();
    this.auditLogger = new AuditLogger();
    this.roleManager = new RoleManager(
      this.auditLogger,
      (userId) => this.permissionChecker.clearUserCache(userId),
      () => this.permissionChecker.clearAllCache()
    );
    this.securityValidator = new SecurityValidator(
      (userId, permission) => this.permissionChecker.checkPermission(userId, permission),
      () => this.roleManager.getAllRoles(),
      (roleId) => this.roleManager.getRolePermissions(roleId)
    );
  }

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  // ==========================================================================
  // Permission Checking (delegated to PermissionChecker)
  // ==========================================================================

  async checkPermission(
    userId: string,
    permission: string,
    scope?: { type: string; id: string }
  ): Promise<boolean> {
    return this.permissionChecker.checkPermission(userId, permission, scope);
  }

  async getUserPermissions(
    userId: string,
    scope?: { type: string; id: string }
  ): Promise<UserPermissionsResponse> {
    return this.permissionChecker.getUserPermissions(userId, scope);
  }

  async checkPermissionWithOrganization(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<boolean> {
    return this.permissionChecker.checkPermissionWithOrganization(userId, permission, organizationId);
  }

  resolvePermissionInheritance(permissions: string[]): string[] {
    return this.permissionChecker.resolvePermissionInheritance(permissions);
  }

  async getPermissionInheritanceTree(roleId: string): Promise<{
    direct: Permission[];
    inherited: Permission[];
    implied: Permission[];
  }> {
    return this.permissionChecker.getPermissionInheritanceTree(
      roleId,
      (id) => this.roleManager.getRolePermissions(id),
      () => this.roleManager.getAllPermissions()
    );
  }

  // ==========================================================================
  // Role Management (delegated to RoleManager)
  // ==========================================================================

  async assignRole(request: AssignRoleRequest): Promise<string> {
    return this.roleManager.assignRole(request);
  }

  async revokeRole(request: RevokeRoleRequest): Promise<boolean> {
    return this.roleManager.revokeRole(request);
  }

  async createRole(request: CreateRoleRequest): Promise<Role> {
    return this.roleManager.createRole(request);
  }

  async updateRole(roleId: string, request: UpdateRoleRequest): Promise<Role> {
    return this.roleManager.updateRole(roleId, request);
  }

  async deleteRole(roleId: string): Promise<boolean> {
    return this.roleManager.deleteRole(roleId);
  }

  async getAllRoles(): Promise<Role[]> {
    return this.roleManager.getAllRoles();
  }

  async getAllPermissions(): Promise<Permission[]> {
    return this.roleManager.getAllPermissions();
  }

  async getRole(roleId: string): Promise<Role> {
    return this.roleManager.getRole(roleId);
  }

  async getRoleWithPermissions(roleId: string): Promise<Role & { permissions: Permission[] }> {
    return this.roleManager.getRoleWithPermissions(roleId);
  }

  async getRolePermissions(roleId: string): Promise<{ permission_id: string; permission: Permission }[]> {
    return this.roleManager.getRolePermissions(roleId);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    return this.roleManager.updateRolePermissions(roleId, permissionIds);
  }

  async getAllUserRoles(): Promise<UserRole[]> {
    return this.roleManager.getAllUserRoles();
  }

  async revokeUserRole(userRoleId: string): Promise<void> {
    return this.roleManager.revokeUserRole(userRoleId);
  }

  async checkUserMigration(userId: string): Promise<{ isMigrated: boolean; needsMigration: boolean }> {
    return this.roleManager.checkUserMigration(userId);
  }

  async migrateUserRoles(userId: string, roles: string[]): Promise<void> {
    return this.roleManager.migrateUserRoles(userId, roles);
  }

  // ==========================================================================
  // Audit Logging (delegated to AuditLogger)
  // ==========================================================================

  async getAuditLogs(filter?: { fromDate?: string; toDate?: string; limit?: number }): Promise<AuditLogEntry[]> {
    return this.auditLogger.getAuditLogs(filter);
  }

  async getAuditLog(filters: AuditLogFilter): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
    return this.auditLogger.getAuditLog(filters);
  }

  // ==========================================================================
  // Security Validation (delegated to SecurityValidator)
  // ==========================================================================

  async isUserSiteAdmin(userId: string): Promise<boolean> {
    return this.securityValidator.isUserSiteAdmin(userId);
  }

  async canUserManageRoles(userId: string): Promise<boolean> {
    return this.securityValidator.canUserManageRoles(userId);
  }

  async validatePermissionEscalation(
    actorId: string,
    targetUserId: string,
    roleName: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    return this.securityValidator.validatePermissionEscalation(actorId, targetUserId, roleName);
  }

  async validateBulkOperation(
    actorId: string,
    operationType: string,
    affectedUsers: string[],
    roleIds?: string[]
  ): Promise<{ isValid: boolean; reason?: string }> {
    return this.securityValidator.validateBulkOperation(actorId, operationType, affectedUsers, roleIds);
  }

  async validateRolePermissionIntegrity(): Promise<{ isValid: boolean; issues: string[] }> {
    return this.securityValidator.validateRolePermissionIntegrity(
      () => this.roleManager.getAllPermissions()
    );
  }

  async getPermissionCheckMetrics(): Promise<{
    cacheHitRate: number;
    averageResponseTime: number;
    totalChecks: number;
    cacheSize: number;
  }> {
    return this.securityValidator.getPermissionCheckMetrics(
      this.permissionChecker.getCacheSize()
    );
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  clearUserCache(userId: string): void {
    this.permissionChecker.clearUserCache(userId);
  }

  clearAllCache(): void {
    this.permissionChecker.clearAllCache();
  }

  setCacheTimeout(timeout: number): void {
    this.permissionChecker.setCacheTimeout(timeout);
  }

  // ==========================================================================
  // Organization Overrides (placeholder - requires DB schema)
  // ==========================================================================

  async createOrganizationOverride(
    organizationId: string,
    roleId: string,
    permissionId: string,
    overrideType: 'grant' | 'deny'
  ): Promise<void> {
    console.log('📝 Creating organization override (mock)', {
      organization_id: organizationId,
      role_id: roleId,
      permission_id: permissionId,
      override_type: overrideType
    });

    this.clearAllCache();

    await this.auditLogger.logAuditEvent(ActionType.PERMISSION_OVERRIDE_CREATED, {
      target_role_id: roleId,
      target_permission_id: permissionId,
      details: {
        organization_id: organizationId,
        override_type: overrideType
      }
    });
  }

  async removeOrganizationOverride(
    organizationId: string,
    roleId: string,
    permissionId: string
  ): Promise<void> {
    console.log('🗑️ Removing organization override (mock)', {
      organization_id: organizationId,
      role_id: roleId,
      permission_id: permissionId
    });

    this.clearAllCache();

    await this.auditLogger.logAuditEvent(ActionType.PERMISSION_OVERRIDE_REMOVED, {
      target_role_id: roleId,
      target_permission_id: permissionId,
      details: { organization_id: organizationId }
    });
  }

  async getOrganizationOverrides(organizationId: string): Promise<Array<Record<string, unknown>>> {
    console.warn('Organization overrides not implemented yet, table does not exist:', organizationId);
    return [];
  }

  // ==========================================================================
  // Role Analysis
  // ==========================================================================

  async analyzeRolePermissions(roleId: string): Promise<{
    totalPermissions: number;
    directPermissions: number;
    impliedPermissions: number;
    coverageByResource: Record<string, number>;
  }> {
    try {
      const inheritanceTree = await this.getPermissionInheritanceTree(roleId);
      const allPermissions = await this.getAllPermissions();

      const coverageByResource: Record<string, number> = {};
      const resourceGroups = allPermissions.reduce((acc, perm) => {
        if (!acc[perm.resource]) acc[perm.resource] = [];
        acc[perm.resource].push(perm);
        return acc;
      }, {} as Record<string, Permission[]>);

      Object.keys(resourceGroups).forEach(resource => {
        const resourcePermissions = resourceGroups[resource];
        const grantedCount = inheritanceTree.direct.filter(p => p.resource === resource).length +
          inheritanceTree.implied.filter(p => p.resource === resource).length;
        coverageByResource[resource] = Math.round((grantedCount / resourcePermissions.length) * 100);
      });

      return {
        totalPermissions: inheritanceTree.direct.length + inheritanceTree.implied.length,
        directPermissions: inheritanceTree.direct.length,
        impliedPermissions: inheritanceTree.implied.length,
        coverageByResource
      };
    } catch (error) {
      console.error('Failed to analyze role permissions:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const rbacService = RBACService.getInstance();
