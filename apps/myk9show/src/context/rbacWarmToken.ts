/**
 * Warm token (MYK9-1349): proof that the SERVER confirmed this user's
 * permissions recently. It is separate from the offline copy
 * (`rbacPermissionsCache`, MYK9-200) on purpose: the offline copy must survive
 * an offline reload whose expired access token resolves with no user, while the
 * warm token is purged whenever auth resolves signed-out, so a session that
 * ended while the app was closed can never warm-paint the next sign-in.
 */
const KEY_PREFIX = 'myk9show:rbac-warm:';

/** A token older than this never lets the app paint before the server answers. */
export const RBAC_WARM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Clock skew tolerated before a future-dated token is treated as invalid. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

interface RbacWarmToken {
  userId: string;
  verifiedAt: string;
  /** `cachedAt` of the offline copy this token vouches for; the warm read needs an exact match. */
  cachedAt: string;
}

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Write the token for the offline copy that was JUST persisted (its `cachedAt`).
 * Call only after that copy saved: a token must never vouch for an older copy
 * left behind by a failed write (quota), which could hold a revoked role.
 */
export function saveRbacWarmToken(userId: string, cachedAt: string): void {
  try {
    const token: RbacWarmToken = { userId, verifiedAt: new Date().toISOString(), cachedAt };
    window.localStorage.setItem(key(userId), JSON.stringify(token));
  } catch {
    // Best effort: no token only means no warm paint.
  }
}

/** The `cachedAt` of the copy a fresh (<=24h) token for this user vouches for, else null. */
export function freshRbacWarmTokenCachedAt(userId: string): string | null {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return null;
    const token = JSON.parse(raw) as Partial<RbacWarmToken>;
    const verifiedAtMs = Date.parse(token.verifiedAt ?? '');
    if (token.userId !== userId || Number.isNaN(verifiedAtMs) || !token.cachedAt) return null;
    const ageMs = Date.now() - verifiedAtMs;
    return ageMs >= -FUTURE_SKEW_MS && ageMs <= RBAC_WARM_MAX_AGE_MS ? token.cachedAt : null;
  } catch {
    return null;
  }
}

export function hasFreshRbacWarmToken(userId: string): boolean {
  return freshRbacWarmTokenCachedAt(userId) !== null;
}

export function clearRbacWarmToken(userId: string): void {
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // Nothing to clear without storage.
  }
}

export function clearAllRbacWarmTokens(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(KEY_PREFIX)) keys.push(k);
    }
    keys.forEach(k => window.localStorage.removeItem(k));
  } catch {
    // Nothing to clear without storage.
  }
}
