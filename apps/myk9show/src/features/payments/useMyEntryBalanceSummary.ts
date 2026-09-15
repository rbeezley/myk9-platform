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
    // `getUserEntries` is network-first with the replicated snapshot as its
    // offline fallback (MYK9-536), but React Query's default
    // `networkMode: 'online'` parks this query at `fetchStatus: 'paused'`
    // offline and never calls it — so the exhibitor's amount due would read as
    // a spinner forever rather than the last known balance.
    networkMode: 'always' as const,
    queryFn: async (): Promise<EntryBalanceSummary> => {
      if (!personId) return summarizeEntryBalances([]);

      const { data, error } = await getUserEntries(personId);
      if (error) throw error;

      return summarizeEntryBalances(
        (data ?? []).map(row => mapEntryRowToBalanceSource(row as OwnEntryBalanceRow))
      );
    },
    ...cacheStrategies.moderate,
  });
}
