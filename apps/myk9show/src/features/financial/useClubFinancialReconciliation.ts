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
  nextCursor,
  type FinancialPageCursor,
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

/** Rows per keyset page. Kept well under the RPC's own cap so a page that comes
 *  back short is a reliable "exhausted" signal. */
const PAGE_SIZE = 500;
/** Hard stop so a cursor bug can never spin forever. 500 x 200 = 100,000 detail
 *  rows — far beyond any real club — so hitting it means something is wrong. */
const MAX_PAGES = 200;

/**
 * Drain a keyset-paginated detail fetcher to completion.
 *
 * A money total assembled from a partial read is worse than no total: it looks
 * authoritative and is quietly short. So if the page cap is ever reached with a
 * cursor still outstanding we THROW rather than return what we have — the hook
 * turns that into `isError`, and the surface renders its explicit "unavailable"
 * state instead of an understated net.
 */
async function fetchAllPages<T extends { createdAt: string; orderId?: string; payoutId?: string }>(
  fetchPage: (args: { limit: number; cursor: FinancialPageCursor | null }) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = [];
  let cursor: FinancialPageCursor | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const rows: T[] = await fetchPage({ limit: PAGE_SIZE, cursor });
    all.push(...rows);
    cursor = nextCursor(rows, PAGE_SIZE);
    if (!cursor) return all;
  }

  throw new Error(
    `Financial reconciliation paging exceeded ${MAX_PAGES} pages (${all.length} rows) ` +
      `without exhausting the cursor — refusing to report a truncated total.`
  );
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
      fetchAllPages(({ limit, cursor }) =>
        fetchFinancialReconciliationOrders({
          scope: 'club',
          clubId: clubId ?? null,
          limit,
          cursor,
        })
      ),
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });

  const payoutsQuery = useQuery({
    queryKey: ['club-financial-reconciliation-payouts', clubId],
    queryFn: () =>
      fetchAllPages(({ limit, cursor }) =>
        fetchFinancialReconciliationPayouts({
          scope: 'club',
          clubId: clubId ?? null,
          limit,
          cursor,
        })
      ),
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
