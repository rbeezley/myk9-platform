/**
 * Device-local persistence for the RBAC permissions response (MYK9-200).
 *
 * "Offline-first" must cover permissions, not just domain data: on a cold
 * boot with no connectivity the session survives (Supabase keeps it in
 * localStorage) but roles cannot be fetched, so every gated route denied a
 * fully-authenticated user. This cache lets the cold-boot path hydrate the
 * last known roles instead of settling at zero.
 *
 * The cache is advisory — it only decides what UI to render. RLS still
 * enforces every read and write server-side, so a stale cached role cannot
 * grant data access the user does not actually have.
 */
import type { UserPermissionsResponse } from '@/types/rbac-types';

/** Entries older than this are ignored — a show weekend plus travel margin. */
export const RBAC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'myk9show:rbac-cache:';

export interface RbacCacheEntry {
  cachedAt: string;
  data: UserPermissionsResponse;
}

function cacheKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function saveRbacPermissionsCache(userId: string, data: UserPermissionsResponse): void {
  try {
    const entry: RbacCacheEntry = { cachedAt: new Date().toISOString(), data };
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // Quota or privacy-mode failure — the cache is best-effort; never let
    // persistence break the live permissions path.
  }
}

export function loadRbacPermissionsCache(userId: string): RbacCacheEntry | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;

    const entry = JSON.parse(raw) as Partial<RbacCacheEntry>;
    const cachedAtMs = Date.parse(entry.cachedAt ?? '');
    const data = entry.data;
    // Element-level checks matter: `roles: [null]` parses fine but throws in
    // mapRbacRoles' destructuring during hydration, which would send a cold
    // boot to the error boundary instead of just discarding the cache.
    const isObjectArray = (value: unknown): boolean =>
      Array.isArray(value) && value.every(item => typeof item === 'object' && item !== null);
    if (
      Number.isNaN(cachedAtMs) ||
      !data ||
      !isObjectArray(data.roles) ||
      !isObjectArray(data.permissions) ||
      !Array.isArray(data.effectivePermissions) ||
      !isObjectArray(data.effectivePermissionScopes)
    ) {
      clearRbacPermissionsCache(userId);
      return null;
    }

    if (Date.now() - cachedAtMs > RBAC_CACHE_TTL_MS) {
      clearRbacPermissionsCache(userId);
      return null;
    }

    return { cachedAt: entry.cachedAt as string, data };
  } catch {
    clearRbacPermissionsCache(userId);
    return null;
  }
}

export function clearRbacPermissionsCache(userId: string): void {
  try {
    window.localStorage.removeItem(cacheKey(userId));
  } catch {
    // Ignore — nothing to clear in environments without storage.
  }
}
