import type { RbacCacheEntry } from './rbacPermissionsCache';
import type {
  EffectivePermissionScope,
  PermissionWithRole,
  UserPermissionsResponse,
  UserRoleWithDetails,
} from '@/types/rbac-types';

export interface RbacState {
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
  /** Painted from a <=24h saved copy while the server answers (MYK9-1349). */
  warmSeeded: boolean;
}

export const EMPTY_STATE: RbacState = {
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
  warmSeeded: false,
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

export function toLoadedState(userId: string, data: UserPermissionsResponse): RbacState {
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
    warmSeeded: false,
  };
}

/** Warm seed: renders at once, but the device is online so no offline notice. */
export function toWarmSeededState(userId: string, entry: RbacCacheEntry): RbacState {
  return {
    ...toLoadedState(userId, entry.data),
    lastRefreshed: entry.cachedAt,
    warmSeeded: true,
  };
}

export function toCacheHydratedState(userId: string, entry: RbacCacheEntry): RbacState {
  return {
    ...toLoadedState(userId, entry.data),
    // Honest timestamps: this data is as old as the cache entry, not "now".
    lastRefreshed: entry.cachedAt,
    fromCacheAt: entry.cachedAt,
  };
}

/**
 * State after a failed load or refresh. Previous roles are always kept.
 * `isOffline` (abort / browser fetch failure) keeps the "working offline"
 * marker, and a warm seed that could not revalidate is cache-served from then
 * on. A non-network failure reached the backend: no offline claim, and a warm
 * seed stays unverified so the lifecycle can retry (MYK9-1349).
 */
export function toFailedState(
  previous: RbacState,
  errorMessage: string,
  isOffline: boolean
): RbacState {
  // A warm seed that cannot revalidate offline becomes exactly the cold-cache
  // hydrated state: no error (an error would drop the default exhibitor role on
  // an empty role list) and the offline notice on.
  if (isOffline && previous.warmSeeded) {
    return {
      ...previous,
      isLoading: false,
      loaded: true,
      error: null,
      fromCacheAt: previous.lastRefreshed,
      warmSeeded: false,
    };
  }
  return {
    ...previous,
    isLoading: false,
    loaded: true,
    error: errorMessage,
    fromCacheAt: isOffline ? previous.fromCacheAt : null,
    // A non-network failure leaves a warm seed unverified so the lifecycle retries.
    warmSeeded: previous.warmSeeded && !isOffline,
  };
}
