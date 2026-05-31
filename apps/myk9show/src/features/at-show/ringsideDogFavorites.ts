import { useCallback, useMemo, useSyncExternalStore } from 'react';

const DOG_FAVORITES_KEY_PREFIX = 'dog_favorites';
const DOG_FAVORITES_CHANGED_EVENT = 'myk9:dog-favorites-changed';

export function buildDogFavoritesKey(showId: string): string {
  return `${DOG_FAVORITES_KEY_PREFIX}_${showId}`;
}

export function readDogFavoriteArmbands(showId: string): number[] {
  try {
    const stored = localStorage.getItem(buildDogFavoritesKey(showId));
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

export function writeDogFavoriteArmbands(showId: string, armbands: Iterable<number>): void {
  localStorage.setItem(buildDogFavoritesKey(showId), JSON.stringify(Array.from(armbands)));
}

function emitDogFavoritesChanged(showId: string): void {
  window.dispatchEvent(new CustomEvent(DOG_FAVORITES_CHANGED_EVENT, { detail: { showId } }));
}

export function useAtShowDogFavorites(showId: string | undefined) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!showId) return () => {};

      const handleFavoriteChange = (event: Event) => {
        if (!(event instanceof CustomEvent) || event.detail?.showId !== showId) return;
        onStoreChange();
      };
      const handleStorage = (event: StorageEvent) => {
        if (event.key === buildDogFavoritesKey(showId)) onStoreChange();
      };

      window.addEventListener(DOG_FAVORITES_CHANGED_EVENT, handleFavoriteChange);
      window.addEventListener('storage', handleStorage);
      return () => {
        window.removeEventListener(DOG_FAVORITES_CHANGED_EVENT, handleFavoriteChange);
        window.removeEventListener('storage', handleStorage);
      };
    },
    [showId]
  );

  const getSnapshot = useCallback(
    () => (showId ? readDogFavoriteArmbands(showId).join(',') : ''),
    [showId]
  );
  const favoriteSnapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const favoriteArmbands = useMemo(
    () => new Set(favoriteSnapshot ? favoriteSnapshot.split(',').map(Number) : []),
    [favoriteSnapshot]
  );

  const toggleFavoriteArmband = useCallback(
    (armband: number) => {
      if (!showId) return;

      const next = new Set(readDogFavoriteArmbands(showId));
      if (next.has(armband)) next.delete(armband);
      else next.add(armband);
      writeDogFavoriteArmbands(showId, next);
      emitDogFavoritesChanged(showId);
    },
    [showId]
  );

  return { favoriteArmbands, toggleFavoriteArmband };
}
