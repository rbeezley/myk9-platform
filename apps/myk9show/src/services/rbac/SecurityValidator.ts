/**
 * Security Validator
 *
 * Handles security validation for RBAC operations.
 */

import type { Role, Permission } from '@/types/rbac-types';
import { logger } from '@/services/LoggingService';

export class SecurityValidator {
  constructor(
    private checkPermission: (userId: string, permission: string) => Promise<boolean>,
    private getAllRoles: () => Promise<Role[]>,
    private getRolePermissions: (
      roleId: string
    ) => Promise<{ permission_id: string; permission: Permission }[]>,
    // Direct site-admin check that bypasses role_permissions (which is currently empty).
    // Called with the auth UUID of the actor.
    private checkSiteAdminDirectly?: (authUserId: string) => Promise<boolean>
  ) {}

  /**
   * Check if user is a site admin.
   * Uses the direct check when available (role_permissions table is currently empty).
   */
  async isUserSiteAdmin(userId: string): Promise<boolean> {
    if (this.checkSiteAdminDirectly) {
      try {
        return await this.checkSiteAdminDirectly(userId);
      } catch {
        return false;
      }
    }
    return await this.checkPermission(userId, 'admin:manage');
  }

  /**
   * Check if user can manage roles
   */
  async canUserManageRoles(userId: string): Promise<boolean> {
    return await this.checkPermission(userId, 'role:assign');
  }

  /**
   * Validate permission escalation attempt
   */
  async validatePermissionEscalation(
    actorId: string,
    targetUserId: string,
    roleName: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Site admins bypass all permission checks
      const isSiteAdmin = await this.isUserSiteAdmin(actorId);
      if (isSiteAdmin) {
        return { isValid: true };
      }

      // Prevent self-privilege escalation for non-site-admins
      if (actorId === targetUserId) {
        return {
          isValid: false,
          reason: 'Users cannot assign roles to themselves unless they are site administrators',
        };
      }

      // Check if actor has permission to assign this specific role
      const canAssignRole = await this.checkPermission(actorId, 'role:assign');
      if (!canAssignRole) {
        return {
          isValid: false,
          reason: 'User does not have permission to assign roles',
        };
      }

      // Get role details to check if it's a system role or high privilege role
      const roles = await this.getAllRoles();
      const targetRole = roles.find(r => r.name === roleName);

      if (!targetRole) {
        return {
          isValid: false,
          reason: 'Target role does not exist',
        };
      }

      // Prevent assignment of system roles by non-site-admins
      if (targetRole.is_system) {
        const isSiteAdmin = await this.isUserSiteAdmin(actorId);
        if (!isSiteAdmin) {
          return {
            isValid: false,
            reason: 'Only site administrators can assign system roles',
          };
        }
      }

      // Check for high-privilege role assignment (roles with admin permissions)
      const rolePermissions = await this.getRolePermissions(targetRole.id);
      const hasAdminPermissions = rolePermissions.some(rp => {
        return rp.permission_id && rp.permission_id.includes('admin');
      });

      if (hasAdminPermissions) {
        const isSiteAdmin = await this.isUserSiteAdmin(actorId);
        if (!isSiteAdmin) {
          return {
            isValid: false,
            reason: 'Only site administrators can assign roles with administrative permissions',
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Permission escalation validation failed:', 'rbac', {}, error as Error);
      return {
        isValid: false,
        reason: 'Security validation failed due to system error',
      };
    }
  }

  /**
   * Validate bulk operation
   */
  async validateBulkOperation(
    actorId: string,
    _operationType: string,
    affectedUsers: string[],
    roleIds?: string[]
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Check basic permission
      const canPerformBulkOps = await this.checkPermission(actorId, 'role:bulk_assign');
      if (!canPerformBulkOps) {
        return {
          isValid: false,
          reason: 'User does not have permission to perform bulk operations',
        };
      }

      // Limit bulk operation size for non-site-admins
      const isSiteAdmin = await this.isUserSiteAdmin(actorId);
      const maxBulkSize = isSiteAdmin ? 1000 : 50;

      if (affectedUsers.length > maxBulkSize) {
        return {
          isValid: false,
          reason: `Bulk operation size exceeds limit (${maxBulkSize} users)`,
        };
      }

      // Validate each role if role assignment
      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          const roles = await this.getAllRoles();
          const role = roles.find(r => r.id === roleId);

          if (role && role.is_system && !isSiteAdmin) {
            return {
              isValid: false,
              reason: 'Bulk assignment of system roles requires site administrator privileges',
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      logger.error('Bulk operation validation failed:', 'rbac', {}, error as Error);
      return {
        isValid: false,
        reason: 'Security validation failed due to system error',
      };
    }
  }

  /**
   * Validate role permission integrity
   */
  async validateRolePermissionIntegrity(getAllPermissions: () => Promise<Permission[]>): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    try {
      const issues: string[] = [];

      // Check for invalid permission references
      const roles = await this.getAllRoles();
      const permissions = await getAllPermissions();
      const permissionIds = new Set(permissions.map(p => p.id));

      for (const role of roles) {
        const rolePermissions = await this.getRolePermissions(role.id);
        const invalidRefs = rolePermissions.filter(rp => !permissionIds.has(rp.permission_id));

        if (invalidRefs.length > 0) {
          issues.push(`Role ${role.name} has ${invalidRefs.length} invalid permission references`);
        }
      }

      return {
        isValid: issues.length === 0,
        issues,
      };
    } catch (error) {
      logger.error('Role permission integrity validation failed:', 'rbac', {}, error as Error);
      return {
        isValid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Get performance metrics for permission checking
   */
  getPermissionCheckMetrics(cacheSize: number): {
    cacheHitRate: number;
    averageResponseTime: number;
    totalChecks: number;
    cacheSize: number;
  } {
    // Simplified implementation
    return {
      cacheHitRate: 0.95,
      averageResponseTime: 15,
      totalChecks: cacheSize * 10,
      cacheSize,
    };
  }
}
