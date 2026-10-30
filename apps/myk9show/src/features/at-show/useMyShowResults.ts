import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { getUserEntries } from '@/services/database/entries';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import { NO_OWN_RESULTS, type OwnShowResult } from './myAtShowEntryDetails.helpers';

type OwnRow = {
  id?: string;
  show_id?: string | null;
  is_scored?: boolean | null;
  result_status?: string | null;
  search_time_seconds?: number | null;
  total_faults?: number | null;
  final_placement?: number | null;
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

  // Re-read when a judge's score lands (entries) or a secretary releases or
  // unreleases a class (classes), so the row follows both.
  useEffect(() => {
    if (!showId || !personId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    const unsubscribeEntries = replicatedEntriesTable.subscribe(refresh);
    const unsubscribeClasses = replicatedClassesTable.subscribe(refresh, { emitCurrent: false });
    return () => {
      unsubscribeEntries();
      unsubscribeClasses();
    };
  }, [queryClient, queryKey, showId, personId]);

  const { data } = useQuery({
    queryKey,
    queryFn: async (): Promise<ReadonlyMap<string, OwnShowResult>> => {
      const { data: rows, error, source } = await getUserEntries(personId as string);
      if (error) throw error;
      const serverConfirmed =
        source === 'confirmed' || source === 'confirmed-move-up-link-unavailable';
      const results = new Map<string, OwnShowResult>();
      for (const row of (rows ?? []) as OwnRow[]) {
        if (!row.id || row.show_id !== showId) continue;
        results.set(row.id, {
          isScored: row.is_scored === true,
          resultStatus: row.result_status ?? null,
          searchTimeSeconds: row.search_time_seconds ?? null,
          totalFaults: row.total_faults ?? null,
          finalPlacement: row.final_placement ?? null,
          resultsReleasedAt: row.class_results_released_at ?? null,
          serverConfirmed,
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
