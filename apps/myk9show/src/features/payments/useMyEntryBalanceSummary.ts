import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { cacheStrategies } from '@/lib/queryClient';
import { viewerScope } from '@/lib/viewerScopedQueryKey';
import { getUserEntries } from '@/services/database/entries';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
  type EntryBalanceSummary,
} from './entryBalanceSummary';

type OwnEntryBalanceRow = EntryBalanceRawRow & {
  registration_id?: string | null;
};

export function useMyEntryBalanceSummary() {
  const { user, userWithRoles } = useAuthContext();
  const legacyPersonId = useCurrentUserPersonId();
  const personId = legacyPersonId ?? userWithRoles?.databaseUserId ?? null;

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
      if (!personId) return summarizeEntryBalances([]);

      const { data, error, stale } = await getUserEntries(personId);
      if (error) throw error;

      const summary = summarizeEntryBalances(
        (data ?? []).map(row => mapEntryRowToBalanceSource(row as OwnEntryBalanceRow))
      );
      // Carry the provenance, do not bury it. This is the exhibitor's money
      // surface: an amount due computed from rows the server never confirmed —
      // a hard-deleted entry still sitting in the per-show snapshot, say — is a
      // phantom debt, and the page needs to be able to tell that it is showing
      // saved data rather than stating a figure as fact.
      return stale ? { ...summary, stale: true } : summary;
    },
    ...cacheStrategies.moderate,
  });
}
