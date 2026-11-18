import { useQuery } from '@tanstack/react-query';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { getRefundEntryNames } from '@/services/database/entries/refundEntryNames';
import { buildRefundEntryNames, type RefundEntryIdentity } from './refundResultNames';

export interface RefundEntryNames {
  names: ReadonlyMap<string, RefundEntryIdentity>;
  status: 'loading' | 'ready' | 'failed';
  /** Re-reads only the failed name lookups; never re-runs a refund. */
  retry: () => void;
}

/**
 * Names for every entry id on a Refund all result (MYK9-1862). The show's staff roster
 * (replica first) names most of them; the ids it lacks are then read online by id, once.
 */
export function useRefundEntryNames(
  showId: string,
  entryIds: readonly string[],
  enabled: boolean
): RefundEntryNames {
  const roster = useSecretaryShowEntriesQuery(showId, enabled);
  const rosterSettled = roster.data !== undefined || roster.isError;
  const rosterNames = buildRefundEntryNames(roster.data);
  const unmatched = [...new Set(entryIds)].filter(id => !rosterNames.has(id)).sort();

  const onlineEnabled = enabled && rosterSettled && unmatched.length > 0;
  const online = useQuery({
    queryKey: ['refund-entry-names', showId, unmatched],
    queryFn: () => getRefundEntryNames(unmatched),
    enabled: onlineEnabled,
    retry: false,
  });

  const names = buildRefundEntryNames(roster.data, online.data);
  const onlineUnsettled =
    onlineEnabled && online.data === undefined && (online.isFetching || !online.isError);
  const status =
    !rosterSettled || onlineUnsettled ? 'loading' : online.isError ? 'failed' : 'ready';

  return {
    names,
    status,
    retry: () => {
      if (roster.isError) void roster.refetch();
      void online.refetch();
    },
  };
}
