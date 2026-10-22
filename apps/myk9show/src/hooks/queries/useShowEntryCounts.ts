import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import { useIsOnline } from '@/hooks/useNetworkStatus';

/**
 * Live entry count per show for the cross-show secretary dashboard (MYK9-1311).
 *
 * ONLINE ONLY by design: no replica carries a per-show entry count on account surfaces,
 * so the number comes from `get_show_entry_counts`, which counts the same rows the show's
 * own Entries page totals (live, any status). A show absent from the returned map means
 * "unknown" (offline, loading, errored, or not manageable) and callers must omit the
 * count, never print a 0. A show present with 0 genuinely has no entries.
 */
/** Root of every count query. NOT under `['entries']`: mutation hooks rewrite
 * every query under that prefix as an array of entry rows, and this cache holds
 * a Map. ReplicationSyncProvider invalidates this root explicitly whenever the
 * entries table syncs or uploads. */
export const SHOW_ENTRY_COUNTS_ROOT = 'show-entry-counts';

export const showEntryCountsQueryKey = (showIds: readonly string[]) =>
  [SHOW_ENTRY_COUNTS_ROOT, [...showIds].sort()] as const;

export function useShowEntryCounts(showIds: readonly string[]): ReadonlyMap<string, number> {
  const isOnline = useIsOnline();
  const { data } = useQuery({
    queryKey: showEntryCountsQueryKey(showIds),
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('get_show_entry_counts', {
        p_show_ids: [...showIds],
      });
      if (error) throw error;
      return new Map((rows ?? []).map(row => [row.show_id, Number(row.entry_count)] as const));
    },
    enabled: isOnline && showIds.length > 0,
    staleTime: 30_000,
  });
  return isOnline && data ? data : EMPTY_COUNTS;
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();
