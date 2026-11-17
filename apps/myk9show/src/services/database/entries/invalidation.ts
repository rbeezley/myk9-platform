import { queryKeys } from '@/lib/queryClient';

/**
 * Describes which entry (and its context) changed.
 * Pass all known IDs — the helper emits only the keys relevant to each present field.
 */
export interface EntryChange {
  entryId?: string;
  showId?: string;
  classId?: string;
  dogId?: string;
}

/**
 * Returns the canonical React Query key-set to invalidate after any entry write.
 *
 * Usage:
 *   const keys = entryInvalidationKeys({ showId, classId, entryId: id });
 *   await Promise.all(keys.map(k => queryClient.invalidateQueries({ queryKey: k })));
 *
 * Over-invalidation (extra keys) is safe; under-invalidation (missing keys) causes
 * stale UI. When uncertain whether a key is needed, include it.
 */
export function entryInvalidationKeys(change: EntryChange): ReadonlyArray<readonly unknown[]> {
  const keys: Array<readonly unknown[]> = [
    queryKeys.entries, // ['entries'] — root; catches all entry-rooted queries
  ];

  if (change.entryId) {
    keys.push(queryKeys.entry(change.entryId));
  }
  if (change.showId) {
    keys.push(queryKeys.showEntries(change.showId));
    keys.push(queryKeys.checkInReport(change.showId));
  }
  if (change.classId) {
    keys.push(queryKeys.classEntries(change.classId));
    // Raw string-key form used by ClassDetailsPage / useRunSheetState / useRunOrderPreset
    keys.push(['classes', change.classId, 'entries']);
  }
  if (change.dogId) {
    keys.push(queryKeys.dogEntries(change.dogId));
  }

  return keys;
}
