// Club-scoped financial reconciliation hook (unified-financial-dashboard,
// MYK9-54, task 3.1/3.2). Follows the useClubStripeAccount.ts hook pattern:
// a typed React Query wrapper with no raw supabase reads of its own — every
// server read goes through the authorized reconciliation RPC wrappers in
// financialReconciliation.ts (fetchFinancialReconciliationOrders/Payouts),
// which are SECURITY DEFINER and authorize the club scope on the server.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import {
  fetchFinancialReconciliationOrders,
  fetchFinancialReconciliationPayouts,
} from './financialReconciliation';
import {
  buildClubShowReconciliationRows,
  type ClubShowReconciliationRow,
} from './clubShowReconciliation';
import type { ShowPayoutRow } from '@/features/payments/useClubStripeAccount';

export interface UseClubFinancialReconciliationResult {
  rows: ClubShowReconciliationRow[];
  isLoading: boolean;
  /** True when either reconciliation source is unavailable — the surface must
   *  show an explicit "unavailable" state and never claim verification. */
  isError: boolean;
  refetch: () => void;
}

/**
 * Build show names for the reconciliation rows from the club's EXISTING
 * payout-history query (ShowPayoutRow), which already carries `show.name`.
 * The reconciliation payout's `payoutId` is the same `show_payouts.id` the
 * history rows key on, so matching by id safely recovers the show name
 * without a second raw read.
 */
function showNamesFromHistory(
  history: ShowPayoutRow[] | undefined,
  reconciliationPayouts: Array<{ payoutId: string; showId: string | null }>
): Map<string, string> {
  const names = new Map<string, string>();
  if (!history || history.length === 0) return names;
  const nameById = new Map(history.map(row => [row.id, row.show?.name]));
  for (const payout of reconciliationPayouts) {
    if (!payout.showId) continue;
    const name = nameById.get(payout.payoutId);
    if (name) names.set(payout.showId, name);
  }
  return names;
}

/**
 * Club-scoped per-show reconciliation: net-to-club, charge verification, and
 * payout settlement (including the copyable stripe_transfer_id). `payoutHistory`
 * is the existing, already-tested useClubPayoutHistory result — passed in so
 * this hook never duplicates that read, only borrows its show names.
 */
export function useClubFinancialReconciliation(
  clubId: string | undefined,
  payoutsEnabled: boolean,
  payoutHistory: ShowPayoutRow[] | undefined
): UseClubFinancialReconciliationResult {
  const ordersQuery = useQuery({
    queryKey: ['club-financial-reconciliation-orders', clubId],
    queryFn: () =>
      fetchFinancialReconciliationOrders({ scope: 'club', clubId: clubId ?? null, limit: 1000 }),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });

  const payoutsQuery = useQuery({
    queryKey: ['club-financial-reconciliation-payouts', clubId],
    queryFn: () =>
      fetchFinancialReconciliationPayouts({ scope: 'club', clubId: clubId ?? null, limit: 1000 }),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });

  const rows = useMemo(() => {
    if (!ordersQuery.data && !payoutsQuery.data) return [];
    const orders = ordersQuery.data ?? [];
    const payouts = payoutsQuery.data ?? [];
    const showNames = showNamesFromHistory(payoutHistory, payouts);
    return buildClubShowReconciliationRows(orders, payouts, payoutsEnabled, showNames);
  }, [ordersQuery.data, payoutsQuery.data, payoutHistory, payoutsEnabled]);

  return {
    rows,
    isLoading: ordersQuery.isLoading || payoutsQuery.isLoading,
    isError: ordersQuery.isError || payoutsQuery.isError,
    refetch: () => {
      ordersQuery.refetch();
      payoutsQuery.refetch();
    },
  };
}
