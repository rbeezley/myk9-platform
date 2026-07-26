import { useCallback, useMemo, useSyncExternalStore } from 'react';

const DOG_FAVORITES_KEY_PREFIX = 'dog_favorites';
const DOG_FAVORITES_CHANGED_EVENT = 'myk9:dog-favorites-changed';

export function buildDogFavoritesKey(showId: string, userId?: string): string {
  return userId
    ? `${DOG_FAVORITES_KEY_PREFIX}_${userId}_${showId}`
    : `${DOG_FAVORITES_KEY_PREFIX}_${showId}`;
}

export function readDogFavoriteArmbands(showId: string, userId?: string): number[] {
  try {
    const stored = localStorage.getItem(buildDogFavoritesKey(showId, userId));
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<number>();
    const armbands: number[] = [];

    for (const value of parsed) {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      const armband =
        typeof value === 'number' && Number.isFinite(value)
          ? value
          : trimmed
            ? Number(trimmed)
            : NaN;
      if (!Number.isInteger(armband) || armband <= 0 || seen.has(armband)) continue;
      seen.add(armband);
      armbands.push(armband);
    }

    return armbands;
  } catch {
    return [];
  }
}

export function writeDogFavoriteArmbands(
  showId: string,
  armbands: Iterable<number>,
  userId?: string
): void {
  localStorage.setItem(buildDogFavoritesKey(showId, userId), JSON.stringify(Array.from(armbands)));
}

export function emitDogFavoritesChanged(showId: string): void {
  window.dispatchEvent(new CustomEvent(DOG_FAVORITES_CHANGED_EVENT, { detail: { showId } }));
}

/**
 * Overwrite the device-local favorites for a show and notify subscribers.
 * Used by the signed-in server reconciliation (`dogFavoritesSync`) to write the
 * resolved set back; the local store stays the single thing the at-show UI reads.
 */
export function replaceDogFavoriteArmbands(
  showId: string,
  armbands: Iterable<number>,
  userId?: string
): void {
  writeDogFavoriteArmbands(showId, armbands, userId);
  emitDogFavoritesChanged(showId);
}

/** Move legacy anonymous favorites into a user scope exactly once. */
export function migrateAnonymousDogFavorites(showId: string, userId: string): void {
  try {
    const anonymousKey = buildDogFavoritesKey(showId);
    if (localStorage.getItem(anonymousKey) === null) return;

    if (localStorage.getItem(buildDogFavoritesKey(showId, userId)) === null) {
      writeDogFavoriteArmbands(showId, readDogFavoriteArmbands(showId), userId);
    } else {
      const merged = new Set([
        ...readDogFavoriteArmbands(showId, userId),
        ...readDogFavoriteArmbands(showId),
      ]);
      writeDogFavoriteArmbands(showId, merged, userId);
    }
    localStorage.removeItem(anonymousKey);
    emitDogFavoritesChanged(showId);
  } catch {
    // A storage failure leaves the anonymous key intact for a later retry.
  }
}

export function useAtShowDogFavorites(showId: string | undefined, userId?: string) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!showId) return () => {};

      const handleFavoriteChange = (event: Event) => {
        if (!(event instanceof CustomEvent) || event.detail?.showId !== showId) return;
        onStoreChange();
      };
      const handleStorage = (event: StorageEvent) => {
        if (event.key === buildDogFavoritesKey(showId, userId)) onStoreChange();
      };

      window.addEventListener(DOG_FAVORITES_CHANGED_EVENT, handleFavoriteChange);
      window.addEventListener('storage', handleStorage);
      return () => {
        window.removeEventListener(DOG_FAVORITES_CHANGED_EVENT, handleFavoriteChange);
        window.removeEventListener('storage', handleStorage);
      };
    },
    [showId, userId]
  );

  const getSnapshot = useCallback(
    () => (showId ? readDogFavoriteArmbands(showId, userId).join(',') : ''),
    [showId, userId]
  );
  const favoriteSnapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const favoriteArmbands = useMemo(
    () => new Set(favoriteSnapshot ? favoriteSnapshot.split(',').map(Number) : []),
    [favoriteSnapshot]
  );

  const toggleFavoriteArmband = useCallback(
    (armband: number) => {
      if (!showId) return;

      const next = new Set(readDogFavoriteArmbands(showId, userId));
      if (next.has(armband)) next.delete(armband);
      else next.add(armband);
      writeDogFavoriteArmbands(showId, next, userId);
      emitDogFavoritesChanged(showId);
    },
    [showId, userId]
  );

  return { favoriteArmbands, toggleFavoriteArmband };
}
