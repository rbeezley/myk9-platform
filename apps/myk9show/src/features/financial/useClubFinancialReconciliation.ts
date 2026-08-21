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
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';

export interface UseClubFinancialReconciliationResult {
  rows: ClubShowReconciliationRow[];
  isLoading: boolean;
  /** True when either reconciliation source is unavailable — the surface must
   *  show an explicit "unavailable" state and never claim verification. */
  isError: boolean;
  refetch: () => void;
}

/**
 * Resolve a display name for every show in the reconciliation rows.
 *
 * Names USED to be borrowed from payout history alone. That left a show with
 * paid orders but NO payout row yet — a normal pre-settlement state this view
 * explicitly supports — labeled with the generic fallback "Show". So the primary
 * source is now the order rows themselves: the orders RPC returns the show name
 * from inside its own authorized scope (not PII, no extra client read).
 *
 * The payout RPC's own `showName` is the second source (20260821120000). It
 * covers the inverse case -- a show with a payout row but no order rows in this
 * page set -- and, unlike payout history, it is not filtered by the
 * shows_select soft-delete predicate, so a soft-deleted show is still named
 * rather than falling through to the generic "Show".
 *
 * Payout history remains only as a last resort, for a row the RPC could not
 * name. The reconciliation payout's `payoutId` is the same `show_payouts.id`
 * the history rows key on, so matching by id is safe.
 */
function resolveShowNames(
  orders: Array<{ showId: string | null; showName: string | null }>,
  reconciliationPayouts: Array<{ payoutId: string; showId: string | null; showName: string | null }>,
  history: ShowPayoutRow[] | undefined
): Map<string, string> {
  const names = new Map<string, string>();

  for (const order of orders) {
    if (order.showId && order.showName) names.set(order.showId, order.showName);
  }

  for (const payout of reconciliationPayouts) {
    if (!payout.showId || names.has(payout.showId)) continue;
    if (payout.showName) names.set(payout.showId, payout.showName);
  }

  if (history && history.length > 0) {
    const nameById = new Map(history.map(row => [row.id, row.show?.name]));
    for (const payout of reconciliationPayouts) {
      if (!payout.showId || names.has(payout.showId)) continue;
      const name = nameById.get(payout.payoutId);
      if (name) names.set(payout.showId, name);
    }
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
  accountState: PayoutsAccountState,
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
    const showNames = resolveShowNames(orders, payouts, payoutHistory);
    return buildClubShowReconciliationRows(orders, payouts, accountState, showNames);
  }, [ordersQuery.data, payoutsQuery.data, payoutHistory, accountState]);

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
