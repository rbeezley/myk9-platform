import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { cacheStrategies } from '@/lib/queryClient';
import { viewerScope } from '@/lib/viewerScopedQueryKey';
import { getUserEntries } from '@/services/database/entries';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalancesFromSource,
  UNKNOWN_ENTRY_BALANCE_SUMMARY,
  type EntryBalanceRawRow,
  type EntryBalanceSummary,
} from './entryBalanceSummary';

type OwnEntryBalanceRow = EntryBalanceRawRow & {
  registration_id?: string | null;
};

export function useMyEntryBalanceSummary() {
  const { user } = useAuthContext();
  // The one resolver, shared with My Shows and both ringside hooks, so the
  // `getUserEntries` cache is one key per account (MYK9-629 restructure 4).
  const personId = useEntriesPersonId();

  return useQuery({
    // `personId` already varies by account, but only incidentally — it is a
    // query parameter that happens to be an identity. The marker states the
    // scoping outright so the guard can see it (MYK9-429).
    queryKey: ['exhibitor', 'my-entry-balance-summary', viewerScope(personId)],
    enabled: Boolean(user?.id && personId),
    // One retry, not the global default of two: each attempt pays the full
    // `getUserEntries` view deadline, so the default turns a dead network into
    // a ~46s spinner before the replica fallback is ever shown.
    retry: 1,
    // `getUserEntries` is network-first with the replicated snapshot as its
    // offline fallback (MYK9-536), but React Query's default
    // `networkMode: 'online'` parks this query at `fetchStatus: 'paused'`
    // offline and never calls it — so the exhibitor's amount due would read as
    // a spinner forever rather than the last known balance.
    networkMode: 'always' as const,
    queryFn: async (): Promise<EntryBalanceSummary> => {
      // No identity is not "nothing owed": an empty-row summary reads as $0.00
      // paid up. The query is gated on `personId`, so this is only the type
      // narrowing, but it answers `unknown` rather than a zeroed `known`.
      if (!personId) return UNKNOWN_ENTRY_BALANCE_SUMMARY;

      const { data, error, source } = await getUserEntries(personId);
      if (error) throw error;

      // The gate lives in the derivation, not in this hook and not in the card.
      // An amount due computed from rows the server never confirmed - a
      // hard-deleted entry still sitting in the per-show snapshot - is a phantom
      // debt, and the surface is no longer trusted to caption it instead of
      // stating it (MYK9-629 restructure 1).
      return summarizeEntryBalancesFromSource(
        (data ?? []).map(row => mapEntryRowToBalanceSource(row as OwnEntryBalanceRow)),
        source
      );
    },
    ...cacheStrategies.moderate,
  });
}
