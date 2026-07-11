import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import {
  buildMyAtShowEntryDetails,
  type AtShowClassSummary,
  type AtShowEntryDetail,
} from './myAtShowEntryDetails.helpers';

export interface UseMyAtShowEntryDetailsResult {
  entries: AtShowEntryDetail[];
  /** True while the ownership set or the entry rows are still resolving. */
  isLoading: boolean;
}

/**
 * The exhibitor's own entries for one show, hydrated with dog name, armband,
 * check-in status, and class name — the data behind the "Your dogs today"
 * show-day view. Reuses `useMyAtShowEntries` for ownership (same offline
 * fallback) and `replicatedEntriesTable.getEntriesByShow`, an already-synced
 * table, for entry detail. `classesById` comes from the class-picker's own
 * already-loaded class list, so this adds no extra class fetch.
 */
export function useMyAtShowEntryDetails(
  showId: string | undefined,
  classesById: ReadonlyMap<string, AtShowClassSummary>
): UseMyAtShowEntryDetailsResult {
  const { ownEntryIds, isLoading: ownershipLoading } = useMyAtShowEntries(showId);

  const entriesQuery = useQuery({
    queryKey: ['at-show', 'my-entries-detail', showId],
    queryFn: () => replicatedEntriesTable.getEntriesByShow(showId as string),
    enabled: !!showId && ownEntryIds.size > 0,
  });

  const entries = useMemo(() => {
    if (!entriesQuery.data) return [];
    return buildMyAtShowEntryDetails(entriesQuery.data, ownEntryIds, classesById);
  }, [entriesQuery.data, ownEntryIds, classesById]);

  return {
    entries,
    isLoading: ownershipLoading || (ownEntryIds.size > 0 && entriesQuery.isLoading),
  };
}
