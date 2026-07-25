/**
 * notificationWatchSet — who the "your turn" push monitor is watching (MYK9-79).
 *
 * The watch set used to be exactly the dogs the signed-in user OWNS. It is now
 * owned dogs UNION the dogs they favorited at a show (armband per show, mirrored
 * to `public.dog_favorites`). A dog that is both owned and favorited is ONE
 * watched entry, not two — the union is taken over entries, and each entry can
 * appear at most once in the run queue.
 *
 * Proximity is NOT recomputed here. `pendingShowEntriesByRunOrder` is the one
 * shared run queue (MYK9-91); the index into it IS the dogs-ahead count the
 * entry-list pill shows, so a push can never state a different number than the
 * screen.
 */

import { pendingShowEntriesByRunOrder } from '@/utils/showEntryRunQueue';
import type { ShowEntry } from '@/store/entry-store-types';

export interface NotificationWatchSet {
  /** Dog ids the user owns. */
  ownedDogIds: ReadonlySet<string>;
  /** Favorited armbands, keyed by show id. Empty for signed-out users. */
  favoriteArmbandsByShow: ReadonlyMap<string, ReadonlySet<number>>;
}

export const EMPTY_WATCH_SET: NotificationWatchSet = {
  ownedDogIds: new Set<string>(),
  favoriteArmbandsByShow: new Map<string, ReadonlySet<number>>(),
};

export function watchSetSize(watch: NotificationWatchSet): number {
  let favorites = 0;
  for (const armbands of watch.favoriteArmbandsByShow.values()) favorites += armbands.size;
  return watch.ownedDogIds.size + favorites;
}

function entryArmband(entry: ShowEntry): number | null {
  const parsed = Number.parseInt(entry.registrationData?.armband ?? '', 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/** True when the user owns this dog OR has favorited its armband at this show. */
export function isWatchedEntry(entry: ShowEntry, watch: NotificationWatchSet): boolean {
  if (watch.ownedDogIds.has(entry.dogId)) return true;

  const armband = entryArmband(entry);
  if (armband === null) return false;
  return watch.favoriteArmbandsByShow.get(entry.showId)?.has(armband) === true;
}

export interface WatchedUpcomingEntry {
  entry: ShowEntry;
  /** Dogs running before this one, straight from the shared run queue. */
  dogsAhead: number;
}

/**
 * The watched entries inside the next `leadDogs` slots of a class's run queue,
 * each with its dogs-ahead count. One result per entry — owned + favorited does
 * not double up.
 */
export function watchedUpcomingEntries(
  entries: readonly ShowEntry[],
  leadDogs: number,
  watch: NotificationWatchSet
): WatchedUpcomingEntry[] {
  const upcoming = pendingShowEntriesByRunOrder(entries).slice(0, leadDogs);
  const seen = new Set<string>();
  const watched: WatchedUpcomingEntry[] = [];

  for (let index = 0; index < upcoming.length; index += 1) {
    const entry = upcoming[index];
    if (seen.has(entry.id) || !isWatchedEntry(entry, watch)) continue;
    seen.add(entry.id);
    watched.push({ entry, dogsAhead: index });
  }

  return watched;
}
