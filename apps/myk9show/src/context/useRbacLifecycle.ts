import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureError } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import { isTransientBrowserFetchError } from '@/services/rbac/PermissionChecker';
import { rbacService } from '@/services/rbac/RBACService';
import type {
  EffectivePermissionScope,
  PermissionWithRole,
  UserPermissionsResponse,
  UserRoleWithDetails,
} from '@/types/rbac-types';

interface RbacState {
  userId: string | null;
  userRoles: UserRoleWithDetails[];
  effectivePermissions: string[];
  effectivePermissionScopes: EffectivePermissionScope[];
  scopedPermissions: PermissionWithRole[];
  isLoading: boolean;
  loaded: boolean;
  error: string | null;
  lastRefreshed: string | null;
}

const EMPTY_STATE: RbacState = {
  userId: null,
  userRoles: [],
  effectivePermissions: [],
  effectivePermissionScopes: [],
  scopedPermissions: [],
  isLoading: false,
  loaded: false,
  error: null,
  lastRefreshed: null,
};

function mapRbacRoles(roles: UserRoleWithDetails[]): UserRoleWithDetails[] {
  return roles.map(role => {
    const { scope_type, ...rest } = role;
    return {
      ...rest,
      ...(scope_type && { scope_type }),
    };
  });
}

function toLoadedState(userId: string, data: UserPermissionsResponse): RbacState {
  return {
    userId,
    userRoles: mapRbacRoles(data.roles),
    effectivePermissions: data.effectivePermissions,
    effectivePermissionScopes: data.effectivePermissionScopes,
    scopedPermissions: data.permissions,
    isLoading: false,
    loaded: true,
    error: null,
    lastRefreshed: new Date().toISOString(),
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    return error.name === 'AbortError' || /AbortError|signal is aborted/i.test(error.message);
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function useRbacLifecycle(userId: string | undefined) {
  const currentUserIdRef = useRef(userId);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<RbacState>(EMPTY_STATE);
  currentUserIdRef.current = userId;

  useEffect(() => {
    if (!userId) {
      requestGenerationRef.current += 1;
      rbacService.clearAllCache();
      setState(EMPTY_STATE);
      return;
    }

    let stale = false;

    const load = async (
      attempt = 0,
      requestGeneration = ++requestGenerationRef.current
    ): Promise<void> => {
      const isCurrentRequest = () =>
        !stale &&
        currentUserIdRef.current === userId &&
        requestGenerationRef.current === requestGeneration;

      try {
        setState(previous =>
          previous.userId === userId
            ? { ...previous, isLoading: true, error: null }
            : { ...EMPTY_STATE, userId, isLoading: true }
        );
        const data = await rbacService.getUserPermissions(userId);
        if (isCurrentRequest()) setState(toLoadedState(userId, data));
      } catch (error) {
        if (!isCurrentRequest()) return;
        if ((isAbortError(error) || isTransientBrowserFetchError(error)) && attempt < 3) {
          await delay(250 * (attempt + 1));
          if (isCurrentRequest()) await load(attempt + 1, requestGeneration);
          return;
        }
        logger.error('Failed to load RBAC data:', 'app', {}, ensureError(error));
        setState(previous => ({
          ...previous,
          isLoading: false,
          loaded: true,
          error: error instanceof Error ? error.message : 'Failed to load permissions',
        }));
      }
    };

    void load();
    const refreshInterval = window.setInterval(
      () => {
        rbacService.clearUserCache(userId);
        void load();
      },
      5 * 60 * 1000
    );

    return () => {
      stale = true;
      requestGenerationRef.current += 1;
      rbacService.clearUserCache(userId);
      window.clearInterval(refreshInterval);
    };
  }, [userId]);

  const refreshPermissions = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const requestGeneration = ++requestGenerationRef.current;
    const isCurrentRequest = () =>
      currentUserIdRef.current === userId &&
      requestGenerationRef.current === requestGeneration;

    try {
      rbacService.clearUserCache(userId);
      const data = await rbacService.getUserPermissions(userId);
      if (isCurrentRequest()) setState(toLoadedState(userId, data));
    } catch (error) {
      if (!isCurrentRequest()) return;
      logger.error('Failed to refresh RBAC data:', 'app', {}, ensureError(error));
      setState(previous => ({
        ...previous,
        isLoading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to refresh permissions',
      }));
    }
  }, [userId]);

  const checkPermissionAsync = useCallback(
    async (permission: string, scope?: { type: string; id: string }): Promise<boolean> => {
      if (!userId) return false;
      return rbacService.checkPermission(userId, permission, scope);
    },
    [userId]
  );

  const belongsToCurrentUser = state.userId === (userId ?? null);

  return {
    belongsToCurrentUser,
    userRoles: belongsToCurrentUser ? state.userRoles : EMPTY_STATE.userRoles,
    effectivePermissions: belongsToCurrentUser
      ? state.effectivePermissions
      : EMPTY_STATE.effectivePermissions,
    effectivePermissionScopes: belongsToCurrentUser
      ? state.effectivePermissionScopes
      : EMPTY_STATE.effectivePermissionScopes,
    scopedPermissions: belongsToCurrentUser
      ? state.scopedPermissions
      : EMPTY_STATE.scopedPermissions,
    isLoading: state.isLoading,
    loaded: state.loaded,
    error: state.error,
    lastRefreshed: state.lastRefreshed,
    refreshPermissions,
    checkPermissionAsync,
  };
}

export function useRbacAdminActions(
  isAdmin: boolean,
  refreshPermissions: () => Promise<void>
) {
  const assignRole = useMemo(
    () =>
      isAdmin
        ? async (
            userId: string,
            roleName: string,
            scope?: { type: string; id: string }
          ): Promise<void> => {
            await rbacService.assignRole({
              userId,
              roleName,
              scopeType: scope?.type,
              scopeId: scope?.id,
            });
            await refreshPermissions();
          }
        : undefined,
    [isAdmin, refreshPermissions]
  );

  const revokeRole = useMemo(
    () =>
      isAdmin
        ? async (
            userId: string,
            roleName: string,
            scope?: { type: string; id: string }
          ): Promise<void> => {
            await rbacService.revokeRole({
              userId,
              roleName,
              scopeType: scope?.type,
              scopeId: scope?.id,
            });
            await refreshPermissions();
          }
        : undefined,
    [isAdmin, refreshPermissions]
  );

  return { assignRole, revokeRole };
}

export function toDbRoles(userRoles: UserRoleWithDetails[]) {
  return userRoles.map(userRole => ({
    id: userRole.role_id,
    name: userRole.role?.name || '',
    display_name: userRole.role?.display_name || userRole.role?.name || '',
  }));
}
