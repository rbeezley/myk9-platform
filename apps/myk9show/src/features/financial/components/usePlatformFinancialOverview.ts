// Platform-scope financial overview for the site-admin payout ledger
// (unified-financial-dashboard, MYK9-54, task 4.1). React Query wraps the shared,
// server-authorized reconciliation service — the client never reads
// stripe_orders/show_payouts directly. An unauthorized caller sees the RPC's
// thrown error (isError), never a silent $0, because financial_reconciliation_*
// RAISEs for a non-site-admin (see _financial_reconciliation_authorize).
import { useQuery } from '@tanstack/react-query';
import {
  getFinancialSummary,
  fetchFinancialReconciliationOrders,
  fetchFinancialReconciliationPayouts,
  type FinancialSummary,
} from '@/features/financial';
import { derivePlatformAttention, type PlatformAttentionSummary } from './platformAttention';

export interface PlatformFinancialOverview {
  summary: FinancialSummary;
  attention: PlatformAttentionSummary;
}

// A single page is used for attention-item detection. The dollar TOTALS in
// `summary` are always complete (server-side SQL aggregation with no row cap —
// see financial_reconciliation_summary); only the attention-item COUNT/drill-down
// below could under-count past this page on a very large platform dataset. The
// platform is pre-launch with no real users yet, so one page is sufficient today;
// revisit with full keyset pagination (nextCursor) if volume grows.
const DETAIL_PAGE_LIMIT = 1000;

export function usePlatformFinancialOverview() {
  return useQuery({
    queryKey: ['admin', 'platform-financial-overview'],
    queryFn: async (): Promise<PlatformFinancialOverview> => {
      const [summary, orders, payouts] = await Promise.all([
        // No entries are passed at platform scope: entry-level lines aren't
        // fetched cross-show here, but platformIncome and the payout-settlement
        // totals are computed entirely server-side and don't need them.
        getFinancialSummary({ scope: 'platform', entries: [] }),
        fetchFinancialReconciliationOrders({ scope: 'platform', limit: DETAIL_PAGE_LIMIT }),
        fetchFinancialReconciliationPayouts({ scope: 'platform', limit: DETAIL_PAGE_LIMIT }),
      ]);

      return {
        summary,
        attention: derivePlatformAttention({
          snapshotMissingCount: summary.chargeVerification.snapshotMissingCount,
          payouts,
          orders,
        }),
      };
    },
  });
}
