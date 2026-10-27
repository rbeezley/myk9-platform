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
import { OFFLINE_SESSION_CACHE_TTL_MS } from './offlineSessionCacheTtl';

/** Entries older than this are ignored — a show weekend plus travel margin. */
export const RBAC_CACHE_TTL_MS = OFFLINE_SESSION_CACHE_TTL_MS;

/**
 * Warm-read bound (MYK9-1349): a saved copy older than this is never used to
 * paint before the server answers. The offline fallback keeps the full TTL.
 */
export const RBAC_WARM_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Clock skew tolerated before a future-dated entry is treated as corrupt. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

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

export function loadRbacPermissionsCache(
  userId: string,
  maxAgeMs: number = RBAC_CACHE_TTL_MS
): RbacCacheEntry | null {
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
      cachedAtMs > Date.now() + FUTURE_SKEW_MS ||
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

    // Too old for THIS reader but still inside the TTL: leave it on disk for
    // the offline fallback.
    if (Date.now() - cachedAtMs > maxAgeMs) return null;

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

/**
 * Remove every user's saved permissions. Used when auth has resolved with no
 * user: a copy that survived a sign-out the app never observed (session expiry
 * or revocation while closed) must not warm-paint the next sign-in.
 */
export function clearAllRbacPermissionsCaches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // Nothing to clear without storage.
  }
}
