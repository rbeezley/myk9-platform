/**
 * Staleness bound (MYK9-1308): a suspension or role change takes effect on the
 * next window focus or tab-visible (at most once per RBAC_FOCUS_REFRESH_GAP_MS),
 * the next reconnect, the next TOKEN_REFRESHED / USER_UPDATED, or at most
 * RBAC_SAFETY_NET_MS on a screen that stays visible (ringside tablet, kiosk).
 * The safety net also invalidates the identity query, so identity keeps no
 * interval of its own. Refreshes read fresh and REPLACE the service cache on
 * success; they never clear it first, so a failed refresh keeps the old roles.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ensureError } from '@myk9/core';
import { logger } from '@/services/LoggingService';
import { isTransientBrowserFetchError } from '@/services/rbac/PermissionChecker';
import { useAuthEventRefresh } from './useAuthEventRefresh';
import { rbacRetryDelayMs } from './rbacLoadRetry';
import { rbacService } from '@/services/rbac/RBACService';
import {
  clearRbacPermissionsCache,
  loadRbacPermissionsCache,
  saveRbacPermissionsCache,
  type RbacCacheEntry,
} from './rbacPermissionsCache';
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
  /** Set when roles were hydrated from the device-local cache (offline cold boot). */
  fromCacheAt: string | null;
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
  fromCacheAt: null,
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
    fromCacheAt: null,
  };
}

function toCacheHydratedState(userId: string, entry: RbacCacheEntry): RbacState {
  return {
    ...toLoadedState(userId, entry.data),
    // Honest timestamps: this data is as old as the cache entry, not "now".
    lastRefreshed: entry.cachedAt,
    fromCacheAt: entry.cachedAt,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    return error.name === 'AbortError' || /AbortError|signal is aborted/i.test(error.message);
  }
  return false;
}

/** Minimum spacing between focus/visibility-driven refreshes. */
export const RBAC_FOCUS_REFRESH_GAP_MS = 60 * 1000;
/** Slow safety net for a screen that never refocuses or reconnects. */
export const RBAC_SAFETY_NET_MS = 15 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function useRbacLifecycle(userId: string | undefined) {
  const currentUserIdRef = useRef(userId);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<RbacState>(EMPTY_STATE);
  const queryClient = useQueryClient();
  const refreshNowRef = useRef<() => void>(() => undefined);
  currentUserIdRef.current = userId;

  // Clear the PRIOR user's persisted permissions whenever the authenticated
  // user id changes — sign-out or account switch — mirroring
  // useResetSavedViewsOnAccountChange. Deliberately NOT in the `!userId`
  // branch below: that branch also runs on every boot before the session
  // resolves, and clearing there would wipe the cache the offline cold-boot
  // path exists to read (MYK9-200).
  const prevAuthedUserIdRef = useRef<string | undefined>(userId);
  useEffect(() => {
    const prevUserId = prevAuthedUserIdRef.current;
    if (prevUserId && prevUserId !== userId) {
      clearRbacPermissionsCache(prevUserId);
    }
    prevAuthedUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      requestGenerationRef.current += 1;
      rbacService.clearAllCache();
      setState(EMPTY_STATE);
      return;
    }

    let stale = false;

    let lastLoadAt = Date.now();
    const load = async (
      attempt = 0,
      requestGeneration = ++requestGenerationRef.current,
      bypassCache = false
    ): Promise<void> => {
      const isCurrentRequest = () =>
        !stale &&
        currentUserIdRef.current === userId &&
        requestGenerationRef.current === requestGeneration;

      try {
        // Silent background refresh: once roles are loaded for this user, keep
        // the state as is (no loading flip, so HomeRedirect and gated routes
        // do not flash a fallback) and replace it on success.
        setState(previous =>
          previous.userId === userId
            ? previous.lastRefreshed !== null
              ? previous
              : { ...previous, isLoading: true, error: null }
            : { ...EMPTY_STATE, userId, isLoading: true }
        );
        const data = bypassCache
          ? await rbacService.getUserPermissions(userId, undefined, { bypassCache })
          : await rbacService.getUserPermissions(userId);
        if (isCurrentRequest()) {
          lastLoadAt = Date.now();
          saveRbacPermissionsCache(userId, data);
          setState(toLoadedState(userId, data));
        }
      } catch (error) {
        if (!isCurrentRequest()) return;
        const retryAfterMs = rbacRetryDelayMs(
          error,
          attempt,
          isAbortError(error) || isTransientBrowserFetchError(error)
        );
        if (retryAfterMs !== null) {
          await delay(retryAfterMs);
          if (isCurrentRequest()) await load(attempt + 1, requestGeneration, bypassCache);
          return;
        }
        logger.error('Failed to load RBAC data:', 'app', {}, ensureError(error));
        setState(previous => {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load permissions';
          // Warm path: this user already has loaded roles in memory — preserve
          // them exactly (MYK9-200 pins this; a refactor must not regress it).
          const hasLoadedData = previous.userId === userId && previous.lastRefreshed !== null;
          // Only a connectivity failure means "offline" — a server/RPC error
          // must surface as an error, not masquerade as offline cache mode.
          const isOffline = isAbortError(error) || isTransientBrowserFetchError(error);
          if (!hasLoadedData && isOffline) {
            // Cold boot (e.g. page reload offline at a venue): fall back to the
            // last persisted permissions instead of settling at zero roles.
            const cached = loadRbacPermissionsCache(userId);
            if (cached) return toCacheHydratedState(userId, cached);
          }
          return {
            ...previous,
            isLoading: false,
            loaded: true,
            error: errorMessage,
            // A non-network failure means we reached the backend — stop
            // claiming "working offline" even if the roles came from cache.
            fromCacheAt: isOffline ? previous.fromCacheAt : null,
          };
        });
      }
    };

    // lastLoadAt is stamped on success only, so a failed refresh leaves the
    // gap open and the next focus retries. A request while one is in flight
    // joins it (visibilitychange + focus arrive together); the marker clears
    // on success AND failure.
    let refreshInFlight: Promise<void> | null = null;
    // Returns true when this call STARTED a load (a joined request returns false).
    const refresh = (): boolean => {
      if (refreshInFlight) return false;
      refreshInFlight = load(0, ++requestGenerationRef.current, true).finally(() => {
        refreshInFlight = null;
      });
      return true;
    };
    // Identity rides along only when a load actually starts, so paired events
    // cost one profile read too; cancelRefetch: false keeps a profile read that
    // is already in flight instead of restarting it (the HTTP request cannot
    // be aborted, so a restart would reach the database twice).
    const refreshWithIdentity = () => {
      if (!refresh()) return;
      void queryClient.invalidateQueries(
        { queryKey: ['userProfile', userId] },
        { cancelRefetch: false }
      );
    };
    void load();

    // Focus-driven, not timer-driven: refresh when the tab comes back, at most
    // once per gap so a flickering focus does not re-fetch each time.
    const refreshIfDue = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastLoadAt < RBAC_FOCUS_REFRESH_GAP_MS) return;
      // Identity rides on every RBAC refresh: the query client's focus manager
      // hears only visibilitychange, not a window focus on a visible tab.
      refreshWithIdentity();
    };
    document.addEventListener('visibilitychange', refreshIfDue);
    window.addEventListener('focus', refreshIfDue);

    // Refresh as soon as connectivity returns — cache-hydrated (offline cold
    // boot) roles should go live promptly, as RbacOfflineNotice promises
    // (MYK9-200). Not gated: the last attempt may have failed offline.
    window.addEventListener('online', refresh);
    refreshNowRef.current = refreshWithIdentity;
    // Skip while hidden: the visibilitychange listener refreshes on show.
    const safetyNet = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') refreshWithIdentity();
    }, RBAC_SAFETY_NET_MS);

    return () => {
      stale = true;
      requestGenerationRef.current += 1;
      rbacService.clearUserCache(userId);
      window.clearInterval(safetyNet);
      document.removeEventListener('visibilitychange', refreshIfDue);
      window.removeEventListener('focus', refreshIfDue);
      window.removeEventListener('online', refresh);
      refreshNowRef.current = () => undefined;
    };
  }, [userId, queryClient]);

  useAuthEventRefresh(userId, refreshNowRef);

  const refreshPermissions = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const requestGeneration = ++requestGenerationRef.current;
    const isCurrentRequest = () =>
      currentUserIdRef.current === userId && requestGenerationRef.current === requestGeneration;

    try {
      const data = await rbacService.getUserPermissions(userId, undefined, { bypassCache: true });
      if (isCurrentRequest()) {
        saveRbacPermissionsCache(userId, data);
        setState(toLoadedState(userId, data));
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      logger.error('Failed to refresh RBAC data:', 'app', {}, ensureError(error));
      const isOffline = isAbortError(error) || isTransientBrowserFetchError(error);
      setState(previous => ({
        ...previous,
        isLoading: false,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to refresh permissions',
        // Same rule as the load path: a non-network failure reached the
        // backend, so stop claiming "working offline".
        fromCacheAt: isOffline ? previous.fromCacheAt : null,
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
    fromCacheAt: belongsToCurrentUser ? state.fromCacheAt : EMPTY_STATE.fromCacheAt,
    refreshPermissions,
    checkPermissionAsync,
  };
}

export function useRbacAdminActions(isAdmin: boolean, refreshPermissions: () => Promise<void>) {
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
