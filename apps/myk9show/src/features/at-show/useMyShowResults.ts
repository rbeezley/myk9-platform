import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { getUserEntries } from '@/services/database/entries';
import { replicatedEntriesTable } from '@/services/replication';
import { NO_OWN_RESULTS, type OwnShowResult } from './myAtShowEntryDetails.helpers';

type OwnRow = {
  id?: string;
  show_id?: string | null;
  is_scored?: boolean | null;
  result_status?: string | null;
  search_time_seconds?: number | null;
  total_faults?: number | null;
  class_results_released_at?: string | null;
};

/**
 * The exhibitor's own results for one show, keyed by entry id, from the same
 * masked read My Entries uses (MYK9-1026). `getUserEntries` prefers the
 * cascade-aware results view and its offline fallback nulls every scored
 * column, so a preset- or privacy-withheld result never reaches the row, even
 * when a staff session on this device left unmasked scores in the show replica.
 */
export function useMyShowResults(showId: string | undefined): ReadonlyMap<string, OwnShowResult> {
  const personId = useEntriesPersonId();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['at-show', 'my-results', personId, showId], [personId, showId]);

  // A judge's score lands in the replica first; re-read so the row follows it.
  useEffect(() => {
    if (!showId || !personId) return;
    return replicatedEntriesTable.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey });
    });
  }, [queryClient, queryKey, showId, personId]);

  const { data } = useQuery({
    queryKey,
    queryFn: async (): Promise<ReadonlyMap<string, OwnShowResult>> => {
      const { data: rows, error } = await getUserEntries(personId as string);
      if (error) throw error;
      const results = new Map<string, OwnShowResult>();
      for (const row of (rows ?? []) as OwnRow[]) {
        if (!row.id || row.show_id !== showId) continue;
        results.set(row.id, {
          isScored: row.is_scored === true,
          resultStatus: row.result_status ?? null,
          searchTimeSeconds: row.search_time_seconds ?? null,
          totalFaults: row.total_faults ?? null,
          resultsReleasedAt: row.class_results_released_at ?? null,
        });
      }
      return results;
    },
    enabled: !!personId && !!showId,
    retry: 1,
    // Account-scoped rows: never let a previous account's results answer.
    placeholderData: () => undefined,
    // `getUserEntries` has its own offline fallback; the default 'online' mode
    // would park this query offline and never reach it.
    networkMode: 'always' as const,
  });

  return data ?? NO_OWN_RESULTS;
}
