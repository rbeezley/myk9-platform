/**
 * Device-local persistence for the authenticated user's people.id pairing.
 *
 * The pairing is deliberately smaller than a profile cache: it unlocks
 * account-scoped replicated reads during an offline cold boot without making
 * stale profile or suspension data authoritative.
 */

/** Keep the pairing for exactly one day; profile identity is authoritative. */
export const PERSON_IDENTITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'myk9show:person-identity-cache:';

export interface PersonIdentityCacheEntry {
  userId: string;
  personId: string;
  cachedAt: string;
}

function cacheKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function savePersonIdentityCache(userId: string, personId: string): void {
  if (!userId || !personId) return;

  try {
    const entry: PersonIdentityCacheEntry = {
      userId,
      personId,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // Storage is best effort and must never block the live auth/profile path.
  }
}

export function loadPersonIdentityCache(userId: string): PersonIdentityCacheEntry | null {
  if (!userId) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;

    const entry = JSON.parse(raw) as Partial<PersonIdentityCacheEntry>;
    const cachedAtMs = Date.parse(entry.cachedAt ?? '');
    const ageMs = Date.now() - cachedAtMs;
    const isValid =
      entry.userId === userId &&
      typeof entry.personId === 'string' &&
      entry.personId.length > 0 &&
      !Number.isNaN(cachedAtMs) &&
      ageMs >= 0 &&
      ageMs <= PERSON_IDENTITY_CACHE_TTL_MS;

    if (!isValid) {
      clearPersonIdentityCache(userId);
      return null;
    }

    return {
      userId,
      personId: entry.personId as string,
      cachedAt: entry.cachedAt as string,
    };
  } catch {
    clearPersonIdentityCache(userId);
    return null;
  }
}

export function clearPersonIdentityCache(userId: string): void {
  if (!userId) return;

  try {
    window.localStorage.removeItem(cacheKey(userId));
  } catch {
    // Ignore storage/privacy-mode failures during account cleanup.
  }
}
