import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  /**
   * Timestamp of the last successful fetch — only changes when fresh data
   * actually lands (unlike `entries`, whose reference can also change from
   * an unrelated `classesById` update). Lets a caller reconcile a local
   * optimistic update against real data without over-triggering.
   */
  dataUpdatedAt: number;
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
 *
 * Subscribes directly to `replicatedEntriesTable` (same pattern
 * `useAccountTodayEntries` uses) rather than relying on any specific
 * mutation to call `invalidateQueries` — a check-in change can reach the
 * local table from several different call sites (the ringside entry-list
 * page, `ClassResultsTable`, the exhibitor's own self-checkin RPC once
 * replication syncs it down), and enumerating each one is fragile. This
 * reacts to the table itself, so it's correct regardless of which surface or
 * mutation path made the change.
 */
export function useMyAtShowEntryDetails(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>,
  ownershipLoading: boolean,
  classesById: ReadonlyMap<string, AtShowClassSummary>
): UseMyAtShowEntryDetailsResult {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId) return;
    return replicatedEntriesTable.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'my-entries-detail', showId] });
    });
  }, [showId, queryClient]);

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
    dataUpdatedAt: entriesQuery.dataUpdatedAt,
  };
}
