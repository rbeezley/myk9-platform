import { useMemo } from 'react';
import { useMyEntryQueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';

/**
 * MYK9-2092: the server's place in line (`get_my_entry_queue_places`) for each of the
 * exhibitor's own entries, as plain numbers. The Ringside class list shows this and never its
 * own count, so every exhibitor screen names one place. Empty offline, while loading and after
 * a failed read: no entry then has a place to show. The same query `useOwnEntryClaims` reads.
 */
export function useOwnEntryServerPlaces(
  ownEntryIds: ReadonlySet<string>
): ReadonlyMap<string, number> {
  const ids = useMemo(() => [...ownEntryIds], [ownEntryIds]);
  const places = useMyEntryQueuePlaces(ids);
  return useMemo(() => {
    const byEntryId = new Map<string, number>();
    for (const [entryId, answer] of places) byEntryId.set(entryId, answer.place);
    return byEntryId;
  }, [places]);
}
