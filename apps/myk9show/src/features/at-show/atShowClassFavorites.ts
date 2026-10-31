/**
 * Device-local class favorites for the at-show class picker (MYK9-1506, owner
 * default: local like v3, never synced).
 *
 * This is the SAME store the picker already read (`favorites_<show>_<trial>`, via
 * `getFavoriteClassIdsForTrial`), which also holds the classes an exhibitor's own
 * entries seeded (`persistAccountTodayClassFavorites`). The heart toggles that
 * store rather than a second one, so a card carries one favorite, the seeded
 * hearts stay, and an exhibitor can un-heart one they no longer care about.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  CLASS_FAVORITES_CHANGED_EVENT as CHANGED_EVENT,
  getDismissedFavoriteClassIds,
  getFavoriteClassIdsForTrial,
  setFavoriteClassDismissals,
  setFavoriteClassIdsForTrial,
} from '@/features/show-today/accountTodayEntries.helpers';
const STORAGE_KEY_PREFIX = 'favorites_';

/**
 * Toggle every section of a card together: a favorite when any section is, so a
 * combined A/B card whose halves disagree resolves to "off" on the next tap.
 */
export function toggleClassFavorites(
  showId: string,
  trialId: string,
  classIds: readonly string[]
): boolean {
  const current = getFavoriteClassIdsForTrial(showId, trialId);
  const isFavorite = classIds.some(id => current.has(id));
  for (const id of classIds) {
    if (isFavorite) current.delete(id);
    else current.add(id);
  }
  const written = setFavoriteClassIdsForTrial(showId, trialId, current);
  if (written) {
    // Remember an explicit un-heart so the entry-based seeding does not undo it.
    const dismissed = getDismissedFavoriteClassIds(showId, trialId);
    for (const id of classIds) {
      if (isFavorite) dismissed.add(id);
      else dismissed.delete(id);
    }
    setFavoriteClassDismissals(showId, trialId, dismissed);
  }
  if (written) window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { showId } }));
  return written;
}

/** Every favorite class id across the show's trials, re-read when a heart is toggled here or in another tab. */
export function useAtShowClassFavorites(showId: string | undefined, trialIds: readonly string[]) {
  const trialKey = trialIds.join(',');
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!showId) return () => {};
      const onCustom = (event: Event) => {
        if (event instanceof CustomEvent && event.detail?.showId === showId) onChange();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key?.startsWith(`${STORAGE_KEY_PREFIX}${showId}_`)) onChange();
      };
      window.addEventListener(CHANGED_EVENT, onCustom);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(CHANGED_EVENT, onCustom);
        window.removeEventListener('storage', onStorage);
      };
    },
    [showId]
  );
  const getSnapshot = useCallback(() => {
    if (!showId || !trialKey) return '';
    const ids = trialKey
      .split(',')
      .flatMap(trialId => [...getFavoriteClassIdsForTrial(showId, trialId)]);
    return ids.sort().join(',');
  }, [showId, trialKey]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const favoriteClassIds = useMemo(() => new Set(snapshot ? snapshot.split(',') : []), [snapshot]);
  const toggleClassFavorite = useCallback(
    (trialId: string | undefined, classIds: readonly string[]) =>
      showId && trialId ? toggleClassFavorites(showId, trialId, classIds) : false,
    [showId]
  );
  return { favoriteClassIds, toggleClassFavorite };
}
