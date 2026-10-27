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
import { onAccountBoundary } from '@/lib/accountBoundary';
import {
  clearAllRbacWarmTokens,
  clearRbacWarmToken,
  freshRbacWarmTokenCachedAt,
  saveRbacWarmToken,
} from './rbacWarmToken';
import {
  clearRbacPermissionsCache,
  loadRbacPermissionsCache,
  saveRbacPermissionsCache,
} from './rbacPermissionsCache';
import type { UserPermissionsResponse, UserRoleWithDetails } from '@/types/rbac-types';
import {
  EMPTY_STATE,
  toCacheHydratedState,
  toFailedState,
  toLoadedState,
  toWarmSeededState,
  type RbacState,
} from './rbacLifecycleState';

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error) {
    return error.name === 'AbortError' || /AbortError|signal is aborted/i.test(error.message);
  }
  return false;
}

/** Minimum spacing between focus/visibility-driven refreshes. */
export const RBAC_FOCUS_REFRESH_GAP_MS = 60 * 1000;
/** Re-revalidation delays after a non-network failure of a warm seed. */
export const RBAC_REVALIDATE_DELAYS_MS = [30_000, 60_000];
/** Slow safety net for a screen that never refocuses or reconnects. */
export const RBAC_SAFETY_NET_MS = 15 * 60 * 1000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

/** Save the server's answer, and a warm token only for a copy that actually persisted. */
function persistVerifiedCopy(userId: string, data: UserPermissionsResponse): void {
  const cachedAt = saveRbacPermissionsCache(userId, data);
  if (cachedAt) saveRbacWarmToken(userId, cachedAt);
  else clearRbacWarmToken(userId);
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
      clearRbacWarmToken(prevUserId);
    }
    prevAuthedUserIdRef.current = userId;
  }, [userId]);

  // The account boundary also fires when auth resolves with NO user (a session
  // that ended while the app was closed, or an offline reload that could not
  // refresh it) and on every identity change. Warm tokens go; the offline copy
  // keeps its MYK9-200 rules (cleared on an observed user change only).
  useEffect(() => onAccountBoundary(clearAllRbacWarmTokens), []);

  useEffect(() => {
    if (!userId) {
      requestGenerationRef.current += 1;
      rbacService.clearAllCache();
      setState(EMPTY_STATE);
      return;
    }

    let stale = false;

    let lastLoadAt = Date.now();
    // Warm seed not yet confirmed by the server (MYK9-1349). While true, a
    // non-network failure schedules bounded re-revalidations so a revocation
    // is not hidden behind a saturated server for a whole safety-net period.
    let unverified = false;
    let revalidations = 0;
    let revalidateTimer: number | undefined;
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
        // MYK9-1349: first load for a user paints from a saved copy (same id,
        // <=24h) while the server answers; success below REPLACES it.
        // The token vouches for one exact copy (MYK9-1349): a copy left behind
        // by a failed later write never matches, so it never warm-paints.
        const tokenCachedAt =
          attempt === 0 && !bypassCache ? freshRbacWarmTokenCachedAt(userId) : null;
        const copy = tokenCachedAt ? loadRbacPermissionsCache(userId) : null;
        const warm = copy && copy.cachedAt === tokenCachedAt ? copy : null;
        if (warm) unverified = true;
        setState(previous =>
          previous.userId === userId
            ? previous.lastRefreshed !== null
              ? previous
              : warm
                ? toWarmSeededState(userId, warm)
                : { ...previous, isLoading: true, error: null }
            : warm
              ? toWarmSeededState(userId, warm)
              : { ...EMPTY_STATE, userId, isLoading: true }
        );
        const data = bypassCache
          ? await rbacService.getUserPermissions(userId, undefined, { bypassCache })
          : await rbacService.getUserPermissions(userId);
        if (isCurrentRequest()) {
          lastLoadAt = Date.now();
          unverified = false;
          persistVerifiedCopy(userId, data);
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
        const failedOffline = isAbortError(error) || isTransientBrowserFetchError(error);
        if (failedOffline) {
          unverified = false;
        } else if (unverified && revalidations < RBAC_REVALIDATE_DELAYS_MS.length) {
          const delayMs = RBAC_REVALIDATE_DELAYS_MS[revalidations++];
          revalidateTimer = window.setTimeout(() => {
            // refresh() uses a fresh generation, so a user change or unmount
            // (which bumps it and clears this timer) can never be overwritten.
            if (!stale && unverified) refresh();
          }, delayMs);
        }
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
          return toFailedState(previous, errorMessage, isOffline);
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
      window.clearTimeout(revalidateTimer);
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
        persistVerifiedCopy(userId, data);
        setState(toLoadedState(userId, data));
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      logger.error('Failed to refresh RBAC data:', 'app', {}, ensureError(error));
      const isOffline = isAbortError(error) || isTransientBrowserFetchError(error);
      setState(previous =>
        toFailedState(
          previous,
          error instanceof Error ? error.message : 'Failed to refresh permissions',
          isOffline
        )
      );
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
