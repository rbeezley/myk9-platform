import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { cacheStrategies } from '@/lib/queryClient';
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
    queryKey: ['exhibitor', 'my-entry-balance-summary', personId],
    enabled: Boolean(user?.id && personId),
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
