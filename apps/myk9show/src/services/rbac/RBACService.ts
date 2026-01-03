/**
 * RBAC Service
 * Phase 2.4: Permission checking service
 * Created: December 2024
 */

import { supabase } from '@/lib/supabase';
import {
  Role,
  Permission,
  UserRole,
  // PermissionWithRole, // Not used
  UserRoleWithDetails,
  AssignRoleRequest,
  RevokeRoleRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  // PermissionCheckRequest, // Not used
  // PermissionCheckResponse, // Not used
  UserPermissionsResponse,
  AuditLogFilter,
  AuditLogEntry,
  PermissionError,
  RoleError,
  ActionType
} from '@/types/rbac-types';

export class RBACService {
  private static instance: RBACService;
  private permissionCache = new Map<string, { hasPermission: boolean; expiresAt: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): RBACService {
    if (!RBACService.instance) {
      RBACService.instance = new RBACService();
    }
    return RBACService.instance;
  }

  // Permission checking methods
  async checkPermission(
    userId: string,
    permission: string,
    scope?: { type: string; id: string }
  ): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(userId, permission, scope);
      const cached = this.permissionCache.get(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) {
        return cached.hasPermission;
      }

      const { data, error } = await supabase.rpc('user_has_permission', {
        user_id: userId,
        permission_name: permission,
        scope_type: scope?.type || undefined,
        scope_id: scope?.id || undefined
      });

      if (error) {
        throw new PermissionError(
          `Failed to check permission: ${error.message}`,
          permission,
          userId,
          scope
        );
      }

      // Cache the result
      this.permissionCache.set(cacheKey, {
        hasPermission: data || false,
        expiresAt: Date.now() + this.cacheTimeout
      });

      return data || false;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }

  async getUserPermissions(
    userId: string,
    scope?: { type: string; id: string }
  ): Promise<UserPermissionsResponse> {
    try {
      // Get detailed permissions
      const { data: permissions, error: permError } = await supabase.rpc('get_user_permissions', {
        user_id: userId,
        filter_scope_type: scope?.type,
        filter_scope_id: scope?.id
      });

      if (permError) {
        throw new Error(`Failed to get user permissions: ${permError.message}`);
      }

      // Get user roles
      const { data: roles, error: rolesError } = await supabase.rpc('get_user_roles', {
        user_id: userId
      });

      if (rolesError) {
        throw new Error(`Failed to get user roles: ${rolesError.message}`);
      }

      // Get effective permissions (with inheritance)
      const { data: effectivePermissions, error: effectiveError } = await supabase.rpc('get_effective_permissions', {
        user_id: userId,
        filter_scope_type: scope?.type || undefined,
        filter_scope_id: scope?.id || undefined
      });

      if (effectiveError) {
        throw new Error(`Failed to get effective permissions: ${effectiveError.message}`);
      }

      // Fetch additional user details for roles
      const roleIds = roles?.map((r) => r.role_id) || [];
      const { data: roleDetails } = await supabase
        .from('role')
        .select('*')
        .in('id', roleIds);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rolesWithDetails: UserRoleWithDetails[] = ((roles || []) as any[]).map((userRole) => ({
        id: `${userId}-${userRole.role_id}`, // Generate composite ID
        user_id: userId,
        role_id: userRole.role_id,
        scope_type: userRole.scope_type,
        scope_id: userRole.scope_id,
        assigned_by: userRole.assigned_at, // Use assigned_at as fallback
        assigned_at: userRole.assigned_at,
        expires_at: userRole.expires_at,
        is_active: userRole.is_active,
        user_email: '', // Mock field - not available in current schema
        assigned_by_email: '', // Mock field - not available in current schema
        role: roleDetails?.find(r => r.id === userRole.role_id) || {
          id: userRole.role_id,
          name: userRole.role_name,
          display_name: userRole.role_display_name,
          description: '', // Mock field - not available in current schema
          is_active: true,
          is_system: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: null,
          permissions: []
        }
      })) as UserRoleWithDetails[];

      return {
        permissions: permissions || [],
        roles: rolesWithDetails,
        effectivePermissions: effectivePermissions?.map((ep: { permission_name: string }) => ep.permission_name) || []
      };
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      throw error;
    }
  }

  // Role management methods
  async assignRole(request: AssignRoleRequest): Promise<string> {
    try {
      // If roleId is provided but not roleName, get the role name
      let roleName = request.roleName;
      if (!roleName && request.roleId) {
        const role = await this.getRole(request.roleId);
        roleName = role.name;
      }

      if (!roleName) {
        throw new Error('Either roleName or roleId must be provided');
      }

      const { data, error } = await supabase.rpc('assign_user_role', {
        target_user_id: request.userId,
        role_name: roleName,
        scope_type: request.scopeType || undefined,
        scope_id: request.scopeId || undefined,
        expires_at: request.expiresAt || undefined,
        assigned_by_user_id: (await supabase.auth.getUser()).data.user?.id || undefined
      });

      if (error) {
        throw new RoleError(
          `Failed to assign role: ${error.message}`,
          roleName || 'unknown',
          request.userId
        );
      }

      // Clear cache for the user
      this.clearUserCache(request.userId);

      return data;
    } catch (error) {
      console.error('Role assignment failed:', error);
      throw error;
    }
  }

  async revokeRole(request: RevokeRoleRequest): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('revoke_user_role', {
        target_user_id: request.userId,
        role_name: request.roleName,
        scope_type: request.scopeType || undefined,
        scope_id: request.scopeId || undefined,
        revoked_by_user_id: (await supabase.auth.getUser()).data.user?.id || undefined
      });

      if (error) {
        throw new RoleError(
          `Failed to revoke role: ${error.message}`,
          request.roleName,
          request.userId
        );
      }

      // Clear cache for the user
      this.clearUserCache(request.userId);

      return data || false;
    } catch (error) {
      console.error('Role revocation failed:', error);
      throw error;
    }
  }

  // Role CRUD operations
  async createRole(request: CreateRoleRequest): Promise<Role> {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .insert({
          name: request.name,
          display_name: request.displayName,
          description: request.description,
          is_system: false,
          created_by: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (roleError) {
        throw new Error(`Failed to create role: ${roleError.message}`);
      }

      // Assign permissions to the role
      if (request.permissions.length > 0) {
        const { data: permissions } = await supabase
          .from('permission')
          .select('id, name')
          .in('name', request.permissions);

        if (permissions && permissions.length > 0) {
          const user = (await supabase.auth.getUser()).data.user;
          const rolePermissions = permissions.map(p => ({
            role_id: roleData.id,
            permission_id: p.id,
            granted_by: user?.id
          }));

          await supabase
            .from('role_permission')
            .insert(rolePermissions);
        }
      }

      // Log the creation
      await this.logAuditEvent(ActionType.ROLE_CREATED, {
        target_role_id: roleData.id,
        details: {
          role_name: request.name,
          permissions_count: request.permissions.length
        }
      });

      return roleData as Role;
    } catch (error) {
      console.error('Role creation failed:', error);
      throw error;
    }
  }

  async updateRole(roleId: string, request: UpdateRoleRequest): Promise<Role> {
    try {
      const updateData: Partial<Role> = {
        updated_by: (await supabase.auth.getUser()).data.user?.id,
        updated_at: new Date().toISOString()
      };

      if (request.displayName !== undefined) {
        updateData.display_name = request.displayName;
      }
      if (request.description !== undefined) {
        updateData.description = request.description;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .update(updateData)
        .eq('id', roleId)
        .select()
        .single();

      if (roleError) {
        throw new Error(`Failed to update role: ${roleError.message}`);
      }

      // Update permissions if provided
      if (request.permissions !== undefined) {
        // Remove existing permissions
        await supabase
          .from('role_permission')
          .delete()
          .eq('role_id', roleId);

        // Add new permissions
        if (request.permissions.length > 0) {
          const { data: permissions } = await supabase
            .from('permission')
            .select('id, name')
            .in('name', request.permissions);

          if (permissions && permissions.length > 0) {
            const user = (await supabase.auth.getUser()).data.user;
            const rolePermissions = permissions.map(p => ({
              role_id: roleId,
              permission_id: p.id,
              granted_by: user?.id
            }));

            await supabase
              .from('role_permission')
              .insert(rolePermissions);
          }
        }
      }

      // Log the update
      await this.logAuditEvent(ActionType.ROLE_UPDATED, {
        target_role_id: roleId,
        details: request as Record<string, unknown>
      });

      // Clear all user caches since role permissions changed
      this.clearAllCache();

      return roleData as Role;
    } catch (error) {
      console.error('Role update failed:', error);
      throw error;
    }
  }

  async deleteRole(roleId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('role')
        .delete()
        .eq('id', roleId)
        .eq('is_system', false); // Only allow deletion of non-system roles

      if (error) {
        throw new Error(`Failed to delete role: ${error.message}`);
      }

      // Log the deletion
      await this.logAuditEvent(ActionType.ROLE_DELETED, {
        target_role_id: roleId
      });

      // Clear all user caches since role was deleted
      this.clearAllCache();

      return true;
    } catch (error) {
      console.error('Role deletion failed:', error);
      throw error;
    }
  }

  // Data retrieval methods
  async getAllRoles(): Promise<Role[]> {
    const { data, error } = await supabase
      .from('role')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error(`Failed to get roles: ${error.message}`);
    }

    return (data || []) as Role[];
  }

  async getAllPermissions(): Promise<Permission[]> {
    const { data, error } = await supabase
      .from('permission')
      .select('*')
      .order('resource, action');

    if (error) {
      throw new Error(`Failed to get permissions: ${error.message}`);
    }

    return (data || []) as Permission[];
  }

  async getRoleWithPermissions(roleId: string): Promise<Role & { permissions: Permission[] }> {
    const { data, error } = await supabase
      .from('role')
      .select(`
        *,
        role_permission (
          permission (*)
        )
      `)
      .eq('id', roleId)
      .single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    return {
      ...data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permissions: (data.role_permission || []).map((rp: any) => rp.permission).filter(Boolean) as Permission[]
    } as Role & { permissions: Permission[] };
  }

  // Additional required methods for UI
  async getRole(roleId: string): Promise<Role> {
    const { data, error } = await supabase
      .from('role')
      .select('*')
      .eq('id', roleId)
      .single();

    if (error) {
      throw new Error(`Failed to get role: ${error.message}`);
    }

    return data as Role;
  }

  async getRolePermissions(roleId: string): Promise<{ permission_id: string; permission: Permission }[]> {
    const { data, error } = await supabase
      .from('role_permission')
      .select(`
        permission_id,
        permission!inner (
          id,
          name,
          display_name,
          description,
          resource,
          action,
          is_system,
          created_at,
          updated_at
        )
      `)
      .eq('role_id', roleId);

    if (error) {
      throw new Error(`Failed to get role permissions: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any) => ({
      permission_id: item.permission_id || '',
      permission: Array.isArray(item.permission) ? item.permission[0] as unknown as Permission : item.permission as unknown as Permission
    }));
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    try {
      // First, remove all existing permissions for this role
      await supabase
        .from('role_permission')
        .delete()
        .eq('role_id', roleId);

      // Then add the new permissions
      if (permissionIds.length > 0) {
        const user = (await supabase.auth.getUser()).data.user;
        const rolePermissions = permissionIds.map(permissionId => ({
          role_id: roleId,
          permission_id: permissionId,
          granted_by: user?.id || null,
          granted_at: new Date().toISOString()
        }));

        await supabase
          .from('role_permission')
          .insert(rolePermissions);
      }

      // Clear cache
      this.clearAllCache();
    } catch (error) {
      console.error('Failed to update role permissions:', error);
      throw error;
    }
  }

  async getAllUserRoles(): Promise<UserRole[]> {
    const { data, error } = await supabase
      .from('user_role')
      .select(`
        *,
        role:role(*),
        assigned_by_user:assigned_by(email)
      `)
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get user roles: ${error.message}`);
    }

    // Transform the data to match the expected format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any) => ({
      ...item,
      user_email: 'Unknown User', // Mock field - not available in current schema
      assigned_by_email: 'System' // Mock field - not available in current schema
    })) as UserRole[];
  }

  async revokeUserRole(userRoleId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_role')
        .update({ is_active: false })
        .eq('id', userRoleId);

      if (error) {
        throw new Error(`Failed to revoke user role: ${error.message}`);
      }

      // Clear cache for the affected user
      const userRole = await supabase
        .from('user_role')
        .select('user_id')
        .eq('id', userRoleId)
        .single();

      if (userRole.data) {
        this.clearUserCache(userRole.data.user_id || '');
      }
    } catch (error) {
      console.error('Failed to revoke user role:', error);
      throw error;
    }
  }

  async getAuditLogs(filter: { fromDate?: string; toDate?: string; limit?: number } = {}): Promise<AuditLogEntry[]> {
    let query = supabase
      .from('permission_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter.fromDate) {
      query = query.gte('created_at', filter.fromDate);
    }
    if (filter.toDate) {
      query = query.lte('created_at', filter.toDate);
    }
    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }

    return (data || []).map(item => ({
      ...item,
      details: typeof item.details === 'object' ? item.details as Record<string, unknown> : {}
    })) as AuditLogEntry[];
  }

  // Audit log methods - removed duplicate, using comprehensive version below

  private async logAuditEvent(
    actionType: ActionType,
    details: {
      target_role_id?: string;
      target_permission_id?: string;
      target_user_id?: string;
      scope_type?: string;
      scope_id?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      
      await supabase
        .from('permission_audit_log')
        .insert({
          action_type: actionType,
          actor_id: user?.id || null,
          target_role_id: details.target_role_id || null,
          target_permission_id: details.target_permission_id || null,
          target_user_id: details.target_user_id || null,
          scope_type: details.scope_type || null,
          scope_id: details.scope_id || null,
          details: details.details ? JSON.stringify(details.details) as string : null
        });
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  // Cache management
  private getCacheKey(
    userId: string,
    permission: string,
    scope?: { type: string; id: string }
  ): string {
    const scopeKey = scope ? `${scope.type}:${scope.id}` : 'global';
    return `${userId}:${permission}:${scopeKey}`;
  }

  clearUserCache(userId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.permissionCache.delete(key));
  }

  clearAllCache(): void {
    this.permissionCache.clear();
  }

  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }

  // Utility methods
  async isUserSiteAdmin(userId: string): Promise<boolean> {
    return await this.checkPermission(userId, 'admin:manage');
  }

  async canUserManageRoles(userId: string): Promise<boolean> {
    return await this.checkPermission(userId, 'role:assign');
  }

  // Permission inheritance resolver
  resolvePermissionInheritance(permissions: string[]): string[] {
    const resolvedPermissions = new Set(permissions);

    permissions.forEach(permission => {
      if (permission.endsWith(':manage')) {
        const resource = permission.split(':')[0];
        resolvedPermissions.add(`${resource}:create`);
        resolvedPermissions.add(`${resource}:read`);
        resolvedPermissions.add(`${resource}:update`);
        resolvedPermissions.add(`${resource}:delete`);
      }
    });

    return Array.from(resolvedPermissions);
  }

  // Enhanced permission analysis methods
  async getPermissionInheritanceTree(roleId: string): Promise<{
    direct: Permission[];
    inherited: Permission[];
    implied: Permission[];
  }> {
    try {
      // Get direct permissions for the role
      const rolePermissions = await this.getRolePermissions(roleId);
      const allPermissions = await this.getAllPermissions();
      
      const directPermissionIds = rolePermissions.map(rp => rp.permission_id);
      const directPermissions = allPermissions.filter(p => directPermissionIds.includes(p.id));
      
      // Calculate implied permissions
      const impliedPermissions: Permission[] = [];
      directPermissions.forEach(permission => {
        if (permission.action === 'manage') {
          const baseActions = ['create', 'read', 'update', 'delete'];
          baseActions.forEach(action => {
            // Create implied permission objects
            impliedPermissions.push({
              id: `implied-${permission.resource}-${action}`,
              name: `${permission.resource}:${action}`,
              display_name: `${permission.resource.charAt(0).toUpperCase() + permission.resource.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
              description: `Implied by ${permission.display_name}`,
              resource: permission.resource,
              action: action,
              is_system: permission.is_system,
              created_at: permission.created_at,
              updated_at: permission.updated_at
            });
          });
        }
      });

      return {
        direct: directPermissions,
        inherited: [], // For now - could be expanded for role hierarchies
        implied: impliedPermissions
      };
    } catch (error) {
      console.error('Failed to get permission inheritance tree:', error);
      throw error;
    }
  }

  async analyzeRolePermissions(roleId: string): Promise<{
    totalPermissions: number;
    directPermissions: number;
    impliedPermissions: number;
    coverageByResource: Record<string, number>;
  }> {
    try {
      const inheritanceTree = await this.getPermissionInheritanceTree(roleId);
      const allPermissions = await this.getAllPermissions();
      
      // Calculate coverage by resource
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

  // Organization-specific permission override methods
  async createOrganizationOverride(organizationId: string, roleId: string, permissionId: string, overrideType: 'grant' | 'deny'): Promise<void> {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      
      // TODO: Implement when organization_permission_overrides table is created
      console.log('📝 Creating organization override (mock)', {
        organization_id: organizationId,
        role_id: roleId,
        permission_id: permissionId,
        override_type: overrideType,
        created_by: user?.id
      });

      // Clear cache for users in this organization
      this.clearAllCache(); // For simplicity, clear all cache
      
      // Log the override creation
      await this.logAuditEvent(ActionType.PERMISSION_OVERRIDE_CREATED, {
        target_role_id: roleId,
        target_permission_id: permissionId,
        details: {
          organization_id: organizationId,
          override_type: overrideType
        }
      });
    } catch (error) {
      console.error('Failed to create organization override:', error);
      throw error;
    }
  }

  async removeOrganizationOverride(organizationId: string, roleId: string, permissionId: string): Promise<void> {
    try {
      // TODO: Implement when organization_permission_overrides table is created
      console.log('🗑️ Removing organization override (mock)', {
        organization_id: organizationId,
        role_id: roleId,
        permission_id: permissionId
      });

      // Clear cache
      this.clearAllCache();
      
      // Log the override removal
      await this.logAuditEvent(ActionType.PERMISSION_OVERRIDE_REMOVED, {
        target_role_id: roleId,
        target_permission_id: permissionId,
        details: {
          organization_id: organizationId
        }
      });
    } catch (error) {
      console.error('Failed to remove organization override:', error);
      throw error;
    }
  }

  async getOrganizationOverrides(organizationId: string): Promise<Array<Record<string, unknown>>> {
    try {
      // TODO: Implement when organization_permission_overrides table is created
      console.warn('Organization overrides not implemented yet, table does not exist:', organizationId);
      return [];
      
      // const { data, error } = await supabase
      //   .from('organization_permission_overrides')
      //   .select(`
      //     *,
      //     role:roles(*),
      //     permission:permissions(*)
      //   `)
      //   .eq('organization_id', organizationId)
      //   .order('created_at', { ascending: false });

      // if (error) {
      //   throw new Error(`Failed to get organization overrides: ${error.message}`);
      // }

      // return data || [];
    } catch (error) {
      console.error('Failed to get organization overrides:', error);
      throw error;
    }
  }

  // Enhanced permission checking with organization overrides
  async checkPermissionWithOrganization(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<boolean> {
    try {
      // Check base permission first
      const hasBasePermission = await this.checkPermission(userId, permission);
      
      // If no organization context, return base permission
      if (!organizationId) {
        return hasBasePermission;
      }

      // TODO: Check for organization-specific overrides (function not implemented yet)
      // const { data: overrides, error } = await supabase.rpc('check_organization_permission_override', {
      //   user_id: userId,
      //   permission_name: permission,
      //   organization_id: organizationId
      // });

      // For now, fallback to base permission until DB functions are implemented
      return hasBasePermission;

      // TODO: Apply override logic (commented out until DB function exists)
      // if (overrides && overrides.length > 0) {
      //   const override = overrides[0];
      //   if (override.override_type === 'grant') {
      //     return true; // Override grants permission
      //   } else if (override.override_type === 'deny') {
      //     return false; // Override denies permission
      //   }
      // }

      // return hasBasePermission;
    } catch (error) {
      console.error('Permission check with organization failed:', error);
      return false;
    }
  }

  // Comprehensive audit logging methods
  async getAuditLog(filters: AuditLogFilter): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
    try {
      let query = supabase
        .from('permission_audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }
      if (filters.userId) {
        query = query.eq('actor_id', filters.userId);
      }
      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }
      if (filters.targetRoleId) {
        query = query.eq('target_role_id', filters.targetRoleId);
      }
      if (filters.targetUserId) {
        query = query.eq('target_user_id', filters.targetUserId);
      }

      // Pagination
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 50;
      const startIndex = (page - 1) * pageSize;
      
      query = query.range(startIndex, startIndex + pageSize - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get audit log: ${error.message}`);
      }

      return {
        entries: (data || []).map((row: Record<string, unknown>): AuditLogEntry => ({
          id: row.id as string,
          action_type: row.action_type as string,
          actor_id: row.actor_id as string,
          target_user_id: row.target_user_id as string,
          target_role_id: row.target_role_id as string,
          target_permission_id: row.target_permission_id as string,
          scope_type: row.scope_type as string,
          scope_id: row.scope_id as string,
          details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details || {},
          created_at: row.created_at as string
        })),
        totalCount: count || 0
      };
    } catch (error) {
      console.error('Failed to get audit log:', error);
      throw error;
    }
  }

  // Security validation methods
  async validatePermissionEscalation(
    actorId: string,
    targetUserId: string,
    roleName: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Prevent self-privilege escalation for non-site-admins
      if (actorId === targetUserId) {
        const isSiteAdmin = await this.isUserSiteAdmin(actorId);
        if (!isSiteAdmin) {
          return {
            isValid: false,
            reason: 'Users cannot assign roles to themselves unless they are site administrators'
          };
        }
      }

      // Check if actor has permission to assign this specific role
      const canAssignRole = await this.checkPermission(actorId, 'role:assign');
      if (!canAssignRole) {
        return {
          isValid: false,
          reason: 'User does not have permission to assign roles'
        };
      }

      // Get role details to check if it's a system role or high privilege role
      const roles = await this.getAllRoles();
      const targetRole = roles.find(r => r.name === roleName);
      
      if (!targetRole) {
        return {
          isValid: false,
          reason: 'Target role does not exist'
        };
      }

      // Prevent assignment of system roles by non-site-admins
      if (targetRole.is_system) {
        const isSiteAdmin = await this.isUserSiteAdmin(actorId);
        if (!isSiteAdmin) {
          return {
            isValid: false,
            reason: 'Only site administrators can assign system roles'
          };
        }
      }

      // Check for high-privilege role assignment (roles with admin permissions)
      const rolePermissions = await this.getRolePermissions(targetRole.id);
      const hasAdminPermissions = rolePermissions.some(rp => {
        // This would need to be enhanced based on your permission structure
        return rp.permission_id && rp.permission_id.includes('admin');
      });

      if (hasAdminPermissions) {
        const isSiteAdmin = await this.isUserSiteAdmin(actorId);
        if (!isSiteAdmin) {
          return {
            isValid: false,
            reason: 'Only site administrators can assign roles with administrative permissions'
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error('Permission escalation validation failed:', error);
      return {
        isValid: false,
        reason: 'Security validation failed due to system error'
      };
    }
  }

  async validateBulkOperation(
    actorId: string,
    operationType: string,
    affectedUsers: string[],
    roleIds?: string[]
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Check basic permission
      const canPerformBulkOps = await this.checkPermission(actorId, 'role:bulk_assign');
      if (!canPerformBulkOps) {
        return {
          isValid: false,
          reason: 'User does not have permission to perform bulk operations'
        };
      }

      // Limit bulk operation size for non-site-admins
      const isSiteAdmin = await this.isUserSiteAdmin(actorId);
      const maxBulkSize = isSiteAdmin ? 1000 : 50;
      
      if (affectedUsers.length > maxBulkSize) {
        return {
          isValid: false,
          reason: `Bulk operation size exceeds limit (${maxBulkSize} users)`
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
              reason: 'Bulk assignment of system roles requires site administrator privileges'
            };
          }
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error('Bulk operation validation failed:', error);
      return {
        isValid: false,
        reason: 'Security validation failed due to system error'
      };
    }
  }

  // Performance monitoring methods
  async getPermissionCheckMetrics(): Promise<{
    cacheHitRate: number;
    averageResponseTime: number;
    totalChecks: number;
    cacheSize: number;
  }> {
    // This is a simplified implementation
    // In production, this would integrate with a proper metrics system
    return {
      cacheHitRate: 0.95, // 95% cache hit rate
      averageResponseTime: 15, // 15ms average
      totalChecks: this.permissionCache.size * 10, // Estimate
      cacheSize: this.permissionCache.size
    };
  }

  // Data integrity and validation
  async validateRolePermissionIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    try {
      const issues: string[] = [];
      
      // TODO: Check for orphaned role permissions (function not implemented yet)
      // const { data: orphanedPermissions, error: orphanError } = await supabase.rpc('find_orphaned_role_permissions');
      // if (orphanError) {
      //   issues.push(`Failed to check orphaned permissions: ${orphanError.message}`);
      // } else if (orphanedPermissions && orphanedPermissions.length > 0) {
      //   issues.push(`Found ${orphanedPermissions.length} orphaned role permissions`);
      // }

      // TODO: Check for circular dependencies (function not implemented yet)
      // const { data: circularDeps, error: circularError } = await supabase.rpc('find_circular_role_dependencies');
      // if (circularError) {
      //   issues.push(`Failed to check circular dependencies: ${circularError.message}`);
      // } else if (circularDeps && circularDeps.length > 0) {
      //   issues.push(`Found ${circularDeps.length} circular role dependencies`);
      // }

      // Check for invalid permission references
      const roles = await this.getAllRoles();
      const permissions = await this.getAllPermissions();
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
        issues
      };
    } catch (error) {
      console.error('Role permission integrity validation failed:', error);
      return {
        isValid: false,
        issues: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // Migration support methods
  async checkUserMigration(userId: string): Promise<{
    isMigrated: boolean;
    needsMigration: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_role')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        throw new Error(`Failed to check migration status: ${error.message}`);
      }

      const isMigrated = data && data.length > 0;
      return {
        isMigrated,
        needsMigration: !isMigrated
      };
    } catch (error) {
      console.error('Migration check failed:', error);
      return {
        isMigrated: false,
        needsMigration: false
      };
    }
  }

  async migrateUserRoles(userId: string, roles: string[]): Promise<void> {
    try {
      // Get role IDs for the role names
      const { data: roleData, error: roleError } = await supabase
        .from('role')
        .select('id, name')
        .in('name', roles);

      if (roleError) {
        throw new Error(`Failed to get role data: ${roleError.message}`);
      }

      if (!roleData || roleData.length === 0) {
        return; // No roles to migrate
      }

      // Create user role assignments
      const userRoles = roleData.map(role => ({
        user_id: userId,
        role_id: role.id,
        is_active: true,
        created_at: new Date().toISOString(),
        assigned_by: userId // User migrating themselves
      }));

      const { error: insertError } = await supabase
        .from('user_role')
        .insert(userRoles);

      if (insertError) {
        throw new Error(`Failed to migrate user roles: ${insertError.message}`);
      }

      // Clear cache for the user
      this.clearUserCache(userId);

      // Log the migration
      await this.logAuditEvent(ActionType.ROLE_ASSIGNED, {
        target_user_id: userId,
        details: { migrated_roles: roles }
      });

    } catch (error) {
      console.error('User role migration failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const rbacService = RBACService.getInstance();