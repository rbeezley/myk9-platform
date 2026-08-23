// Platform-scope financial overview for the site-admin payout ledger
// (unified-financial-dashboard, MYK9-54, task 4.1). React Query wraps the shared,
// server-authorized reconciliation service — the client never reads
// stripe_orders/show_payouts directly. An unauthorized caller sees the RPC's
// thrown error (isError), never a silent $0, because financial_reconciliation_*
// RAISEs for a non-site-admin (see _financial_reconciliation_authorize).
import { useQuery } from '@tanstack/react-query';
import {
  getFinancialSummary,
  fetchFinancialReconciliationPayouts,
  type FinancialSummary,
} from '@/features/financial';
import { nextCursor, type FinancialPageCursor } from '../financialReconciliation';
import { derivePlatformAttention, type PlatformAttentionSummary } from './platformAttention';

export interface PlatformFinancialOverview {
  summary: FinancialSummary;
  attention: PlatformAttentionSummary;
  /**
   * True when the keyset walk hit MAX_DETAIL_PAGES before exhausting the rows, so
   * the attention COUNTS below are a floor, not a total. Surfaced in the UI —
   * never silently truncated. (Dollar totals in `summary` are unaffected: they
   * come from server-side SQL aggregation with no row cap.)
   */
  detailTruncated: boolean;
}

// Detail rows are walked to completion via the keyset cursor (design.md, task
// 1.7) so attention counts can't under-report past the first page. The cap is a
// safety valve against an unbounded loop only; hitting it sets detailTruncated.
const DETAIL_PAGE_LIMIT = 1000;
const MAX_DETAIL_PAGES = 50;

/** Walk a keyset-paginated detail endpoint to completion. */
async function fetchAllPages<T extends { createdAt: string; orderId?: string; payoutId?: string }>(
  fetchPage: (cursor: FinancialPageCursor | null) => Promise<T[]>
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let cursor: FinancialPageCursor | null = null;

  for (let page = 0; page < MAX_DETAIL_PAGES; page += 1) {
    const batch: T[] = await fetchPage(cursor);
    rows.push(...batch);
    cursor = nextCursor(batch, DETAIL_PAGE_LIMIT);
    if (!cursor) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

export function usePlatformFinancialOverview() {
  return useQuery({
    queryKey: ['admin', 'platform-financial-overview'],
    queryFn: async (): Promise<PlatformFinancialOverview> => {
      // ORDER ROWS ARE NO LONGER FETCHED HERE. They existed solely to feed the
      // deleted inference-based attention categories (see platformAttention.ts).
      // Every remaining platform figure is either a server-side aggregate on
      // `summary` (no row cap) or derived from the payout rows below, so walking
      // every stripe_orders row cross-platform bought nothing.
      const [summary, payoutPages] = await Promise.all([
        // No entries are passed at platform scope: entry-level lines aren't
        // fetched cross-show here, but platformIncome and the payout-settlement
        // totals are computed entirely server-side and don't need them.
        getFinancialSummary({ scope: 'platform', entries: [] }),
        fetchAllPages(cursor =>
          fetchFinancialReconciliationPayouts({
            scope: 'platform',
            limit: DETAIL_PAGE_LIMIT,
            cursor,
          })
        ),
      ]);

      return {
        summary,
        detailTruncated: payoutPages.truncated,
        attention: derivePlatformAttention({
          snapshotMissingCount: summary.chargeVerification.snapshotMissingCount,
          payouts: payoutPages.rows,
        }),
      };
    },
    // Same blind spot as the club card, same fix (MYK9-231 AC3). #1727 took out
    // every financial reconciliation surface, club AND site-admin, and left no
    // trace anywhere an operator could see it.
    meta: { reportToSentry: true },
  });
}
