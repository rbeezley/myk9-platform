import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { cacheStrategies } from '@/lib/queryClient';
import { getUserEntries } from '@/services/database/entries';
import { mapEntryStatus, mapPaymentStatus } from '@/utils/entryManagementUtils';
import { parseShowDate } from '@/pages/MyEntriesPage/modules/myEntriesStats.helpers';
import { summarizeEntryBalances, type EntryBalanceSummary } from './entryBalanceSummary';
import type { EntryBalanceSource } from './entryBalanceSummary';

type OwnEntryBalanceRow = Record<string, unknown> & {
  id: string;
  registration_id?: string | null;
  show_id?: string | null;
  entry_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  entry_fee?: number | null;
  show?: {
    id?: string | null;
    name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  } | null;
  registration?: {
    payment_status?: string | null;
  } | null;
};

function mapBalanceRow(row: OwnEntryBalanceRow): EntryBalanceSource {
  const show = row.show;
  const paymentStatus = row.registration?.payment_status ?? row.payment_status ?? 'pending';

  return {
    id: row.id,
    showId: show?.id ?? row.show_id ?? '',
    showName: show?.name ?? null,
    showDate: parseShowDate(show?.start_date) ?? new Date(),
    showEndDate: parseShowDate(show?.end_date),
    entryStatus: mapEntryStatus(row.entry_status ?? 'pending'),
    paymentStatus: mapPaymentStatus(paymentStatus),
    paymentMethod: row.payment_method ?? null,
    totalFee: row.entry_fee ?? 0,
  };
}

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
        (data ?? []).map(row => mapBalanceRow(row as OwnEntryBalanceRow))
      );
    },
    ...cacheStrategies.moderate,
  });
}
