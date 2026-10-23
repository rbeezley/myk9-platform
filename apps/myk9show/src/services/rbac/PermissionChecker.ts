/**
 * Permission Checker
 *
 * Handles permission checking with caching for RBAC.
 * Uses Supabase RPC functions for permission resolution.
 *
 * Note: The RPC functions called here (user_has_permission, get_user_permissions,
 * get_user_roles, get_effective_permissions) exist in the database (migration 017)
 * but are not in the generated Supabase types. We use a narrowly-typed client
 * interface to call them safely.
 */

import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import {
  Permission,
  UserRoleWithDetails,
  UserPermissionsResponse,
  PermissionError,
} from '@/types/rbac-types';

// RPC return types matching actual database function signatures
interface DbUserRole {
  role_id: string;
  role_name: string;
  role_description: string;
  scope_type: string;
  scope_id: string | null;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface DbUserPermission {
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

interface DbEffectivePermission {
  permission_code: string;
  permission_name: string;
  source_type: string;
  source_role: string;
  scope_id: string | null;
  scope_type: string;
}

/**
 * Narrow interface for calling Supabase RPC functions that aren't in generated types.
 * The RBAC RPC functions (user_has_permission, get_user_permissions, get_user_roles,
 * get_effective_permissions) exist in the database from migration 017 but aren't
 * included in the auto-generated Database type.
 */
interface UntypedRpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<PostgrestSingleResponse<unknown>>;
}

export function isTransientBrowserFetchError(error: unknown): boolean {
  // A DOMException is not an Error in every runtime (jsdom), and it is what an aborted
  // fetch rejects with.
  if (!(error instanceof Error) && !(error instanceof DOMException)) return false;
  // Offline fetch rejections are browser-specific: Chrome "Failed to fetch",
  // Safari "Load failed", Firefox "NetworkError when attempting to fetch".
  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /AbortError|TimeoutError|signal is aborted|Failed to fetch|Load failed|NetworkError/i.test(
      error.message
    )
  );
}

/**
 * Helper to call RPC functions that are not in generated Supabase types.
 * Uses a narrow UntypedRpcClient cast instead of `as any` to preserve
 * type safety on the response shape.
 */
async function rpc<T>(
  name: string,
  params: Record<string, unknown>
): Promise<PostgrestSingleResponse<T>> {
  // Cast to UntypedRpcClient: the generated Database type doesn't include RBAC
  // RPC functions from migration 017, but they exist at runtime in the database.
  const client = supabase as unknown as UntypedRpcClient;
  return client.rpc(name, params) as Promise<PostgrestSingleResponse<T>>;
}

export class PermissionChecker {
  private permissionCache = new Map<string, { hasPermission: boolean; expiresAt: number }>();
  private completeAccessCache = new Map<
    string,
    { result: UserPermissionsResponse; expiresAt: number }
  >();
  private completeAccessInFlight = new Map<string, Promise<UserPermissionsResponse>>();
  private accessGeneration = new Map<string, number>();
  private accessEpoch = 0;
  private bypassSeq = new Map<string, number>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a user has a specific permission
   */
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

      const generation = this.accessGeneration.get(userId) ?? 0;
      const epoch = this.accessEpoch;

      // user_has_permission is from migration 017 (not in generated types)
      const { data, error } = await rpc<boolean>('user_has_permission', {
        user_id: userId,
        permission_name: permission,
        scope_type: scope?.type ?? null,
        scope_id: scope?.id ?? null,
      });

      if (error) {
        throw new PermissionError(
          `Failed to check permission: ${error.message}`,
          permission,
          userId,
          scope
        );
      }

      const hasPermission = data === true;

      if (this.accessEpoch === epoch && (this.accessGeneration.get(userId) ?? 0) === generation) {
        this.permissionCache.set(cacheKey, {
          hasPermission,
          expiresAt: Date.now() + this.cacheTimeout,
        });
      }

      return hasPermission;
    } catch (error) {
      logger.error('Permission check failed:', 'rbac', {}, error as Error);
      return false;
    }
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(
    userId: string,
    _scope?: { type: string; id: string },
    options?: { bypassCache?: boolean }
  ): Promise<UserPermissionsResponse> {
    // bypassCache (MYK9-1308): a focus/online/explicit refresh must read the
    // server, but must not clear first. The old entry stays until the fresh
    // read succeeds and replaces it, so a failed refresh never leaves a window
    // with no permissions. It also skips the in-flight join: a load that began
    // before the change being refreshed for would hand back the old answer.
    if (!options?.bypassCache) {
      const cached = this.completeAccessCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }

      const inFlight = this.completeAccessInFlight.get(userId);
      if (inFlight) {
        return inFlight;
      }
    }

    const generation = this.accessGeneration.get(userId) ?? 0;
    const epoch = this.accessEpoch;
    // A newer load of either kind supersedes an older one: only the newest may write.
    const seq = (this.bypassSeq.get(userId) ?? 0) + 1;
    this.bypassSeq.set(userId, seq);
    const load = this.loadUserPermissions(userId)
      .then(result => {
        const superseded = this.bypassSeq.get(userId) !== seq;
        if (
          !superseded &&
          this.accessEpoch === epoch &&
          (this.accessGeneration.get(userId) ?? 0) === generation
        ) {
          // Only after a successful load: drop this user's per-permission
          // answers so a revoked permission is not served from them (the old
          // clear-first behaviour, minus the window with nothing cached).
          this.completeAccessCache.set(userId, {
            result,
            expiresAt: Date.now() + this.cacheTimeout,
          });
          if (options?.bypassCache) {
            this.deletePermissionEntries(userId);
            // Advance the generation checkPermission compares, so a check that
            // STARTED before this refresh cannot re-cache a revoked answer.
            this.accessGeneration.set(userId, generation + 1);
          }
        }
        return result;
      })
      .finally(() => {
        if (this.completeAccessInFlight.get(userId) === load) {
          this.completeAccessInFlight.delete(userId);
        }
      });

    this.completeAccessInFlight.set(userId, load);
    return load;
  }

  private async loadUserPermissions(userId: string): Promise<UserPermissionsResponse> {
    try {
      // Three independent reads (migration 017), issued together: the at-show
      // access gate waits on this before the first paint, so under a slow
      // server it must cost one round trip, not three in a row (MYK9-1333).
      // Errors are still checked in the original order.
      const [
        { data: permissions, error: permError },
        { data: roles, error: rolesError },
        { data: effectivePermissions, error: effectiveError },
      ] = await Promise.all([
        rpc<DbUserPermission[]>('get_user_permissions', { user_id: userId }),
        rpc<DbUserRole[]>('get_user_roles', { user_id: userId }),
        rpc<DbEffectivePermission[]>('get_effective_permissions', { user_id: userId }),
      ]);

      if (permError) {
        throw new Error(`Failed to get user permissions: ${permError.message}`);
      }
      if (rolesError) {
        throw new Error(`Failed to get user roles: ${rolesError.message}`);
      }
      if (effectiveError) {
        throw new Error(`Failed to get effective permissions: ${effectiveError.message}`);
      }

      // Map RPC role results to UserRoleWithDetails
      const typedRoles = roles ?? [];
      const rolesWithDetails: UserRoleWithDetails[] = typedRoles.map(userRole => {
        const scopeType = userRole.scope_type || 'global';
        const scopeId = userRole.scope_id || null;

        return {
          id: `${userId}-${userRole.role_id}-${scopeType}-${scopeId ?? 'global'}`,
          user_id: userId,
          role_id: userRole.role_id,
          club_id: scopeType === 'club' ? scopeId : null,
          show_id: scopeType === 'show' ? scopeId : null,
          granted_by: null,
          granted_at: userRole.granted_at,
          expires_at: userRole.expires_at,
          scope_type: scopeType,
          scope_id: scopeId,
          is_active: userRole.is_active,
          user_email: '',
          assigned_by_email: '',
          role: {
            id: userRole.role_id,
            name: userRole.role_name,
            description: userRole.role_description,
            is_system: null,
            permissions: null,
            created_at: null,
            display_name: userRole.role_name,
            is_active: true,
          },
        };
      });

      // Map effective permissions
      const typedEffective = effectivePermissions ?? [];

      // Map user permissions to PermissionWithRole format
      const typedPermissions = permissions ?? [];
      const mappedPermissions = typedPermissions.map(p => ({
        permission_id: p.permission_id,
        permission_code: p.permission_code,
        permission_name: p.permission_name,
        description: p.description,
        category: p.category,
        role_id: p.role_id,
        role_name: p.role_name,
        scope_type: p.scope_type,
        scope_id: p.scope_id,
      }));

      return {
        permissions: mappedPermissions,
        roles: rolesWithDetails,
        effectivePermissions: typedEffective.map(ep => ep.permission_code || ep.permission_name),
        effectivePermissionScopes: typedEffective.map(ep => ({
          permission_code: ep.permission_code || ep.permission_name,
          scope_type: ep.scope_type,
          scope_id: ep.scope_id,
        })),
      };
    } catch (error) {
      if (!isTransientBrowserFetchError(error)) {
        logger.error('Failed to get user permissions:', 'rbac', {}, error as Error);
      }
      throw error;
    }
  }

  /**
   * Check permission with organization context
   */
  async checkPermissionWithOrganization(
    userId: string,
    permission: string,
    organizationId?: string
  ): Promise<boolean> {
    try {
      const hasBasePermission = await this.checkPermission(userId, permission);

      if (!organizationId) {
        return hasBasePermission;
      }

      // Check for organization-scoped permission
      const hasScopedPermission = await this.checkPermission(userId, permission, {
        type: 'club',
        id: organizationId,
      });

      return hasBasePermission || hasScopedPermission;
    } catch (error) {
      logger.error('Permission check with organization failed:', 'rbac', {}, error as Error);
      return false;
    }
  }

  /**
   * Resolve permission inheritance (e.g., :manage implies CRUD)
   */
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

  /**
   * Get permission inheritance tree for a role
   */
  async getPermissionInheritanceTree(
    roleId: string,
    getRolePermissions: (
      roleId: string
    ) => Promise<{ permission_id: string; permission: Permission }[]>,
    getAllPermissions: () => Promise<Permission[]>
  ): Promise<{
    direct: Permission[];
    inherited: Permission[];
    implied: Permission[];
  }> {
    try {
      const rolePermissions = await getRolePermissions(roleId);
      const allPermissions = await getAllPermissions();

      const directPermissionIds = rolePermissions.map(rp => rp.permission_id);
      const directPermissions = allPermissions.filter(p => directPermissionIds.includes(p.id));

      // Calculate implied permissions from :manage
      const impliedPermissions: Permission[] = [];
      directPermissions.forEach(permission => {
        const code = permission.code || '';
        if (code.endsWith(':manage')) {
          const resource = code.split(':')[0];
          const baseActions = ['create', 'read', 'update', 'delete'];
          baseActions.forEach(action => {
            impliedPermissions.push({
              id: `implied-${resource}-${action}`,
              code: `${resource}:${action}`,
              name: `${resource.charAt(0).toUpperCase() + resource.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
              description: `Implied by ${permission.name}`,
              category: permission.category,
              created_at: permission.created_at,
              display_name: `${resource.charAt(0).toUpperCase() + resource.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
              resource: resource,
              action: action,
              is_system: permission.is_system ?? false,
            });
          });
        }
      });

      return {
        direct: directPermissions,
        inherited: [],
        implied: impliedPermissions,
      };
    } catch (error) {
      logger.error('Failed to get permission inheritance tree:', 'rbac', {}, error as Error);
      throw error;
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

  private deletePermissionEntries(userId: string): void {
    for (const key of [...this.permissionCache.keys()]) {
      if (key.startsWith(`${userId}:`)) this.permissionCache.delete(key);
    }
  }

  clearUserCache(userId: string): void {
    this.deletePermissionEntries(userId);
    this.completeAccessCache.delete(userId);
    this.completeAccessInFlight.delete(userId);
    this.accessGeneration.set(userId, (this.accessGeneration.get(userId) ?? 0) + 1);
  }

  clearAllCache(): void {
    this.permissionCache.clear();
    this.completeAccessCache.clear();
    this.completeAccessInFlight.clear();
    this.accessEpoch += 1;
    for (const [userId, generation] of this.accessGeneration) {
      this.accessGeneration.set(userId, generation + 1);
    }
  }

  getCacheSize(): number {
    return this.permissionCache.size;
  }
}
