import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication';
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
 * show-day view. Takes ownership (`ownEntryIds`) from the caller's own
 * `useMyAtShowEntries` call rather than calling it again here — that hook
 * subscribes to 4 replicated tables and writes to localStorage, so a second
 * instance in the same tree would double that work for no benefit.
 * `classesById` comes from the class-picker's own already-loaded class list,
 * so this adds no extra class fetch.
 */
export function useMyAtShowEntryDetails(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>,
  ownershipLoading: boolean,
  classesById: ReadonlyMap<string, AtShowClassSummary>
): UseMyAtShowEntryDetailsResult {
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
