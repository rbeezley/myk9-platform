// Club-scoped per-show reconciliation rows (unified-financial-dashboard,
// MYK9-54, task 3.2). Pure TypeScript only — no React, no supabase.
//
// Groups the club-scoped reconciliation ORDER rows (stripe_orders, charge
// facts) and PAYOUT rows (show_payouts, settlement facts) by show so the
// treasurer sees, per show:
//   - chargeVerification: a COVERAGE statement across the show's Stripe orders.
//                        AllFeeBreakdowns means every order carries the fee
//                        snapshot; SomeFeeBreakdownsMissing means at least one
//                        does not; NoStripeCharges means the show has no
//                        stripe_orders rows at all. INTENT: the club card must
//                        never imply a Stripe check it cannot back up, so the
//                        aggregate degrades to SomeFeeBreakdownsMissing rather
//                        than up. There is no "Mismatch" — see
//                        chargeVerification.ts for why the amount-tie-out
//                        inference was removed.
//   - settlement:         the existing payout-settlement row (badge label,
//                        state, copyable stripe_transfer_id), when the club
//                        has a payout row for that show.
//
// NO MONEY FIGURES (MYK9-1985). A show's Collected, Refunded, owed and Paid come
// from the server (club_show_payout_figures, useClubShowPayoutFigures), computed
// the way the payout run computes them. The per-show net this module used to
// derive from the order rows was a second, different answer: its refunds include
// the platform fee on a whole-show refund and its subtotal is the checkout
// snapshot, so it disagreed with the payout run and the owner's ledger.
import { resolveOrderChargeVerification } from './chargeVerification';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from './financialReconciliation';
import { resolvePayoutSettlement, type PayoutSettlementRow } from './payoutSettlement';
import { selectAuthoritativePayout } from './payoutSupersession';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';

/**
 * A show-level COVERAGE statement, deliberately distinct from the per-order
 * `ChargeVerificationState`. The aggregate is not the same claim as the row:
 * one order without a fee snapshot degrades the whole show, so a name like
 * "no Stripe record" would be FALSE for a show with fifty snapshotted orders
 * and one without (MYK9-230 review). These three say what is actually true.
 *
 * 'NoStripeCharges' is not a weaker 'SomeFeeBreakdownsMissing'. It means there
 * are no `stripe_orders` rows for the show at all — every entry was paid at the
 * desk, or none was paid yet. That is a real and ordinary state with real money
 * behind it, so it must not be rendered as an absence of any charge record.
 */
export type ClubShowChargeVerification =
  'AllFeeBreakdowns' | 'SomeFeeBreakdownsMissing' | 'NoStripeCharges';

export interface ClubShowReconciliationRow {
  showId: string;
  /** Falls back to a generic label when no show name is known for this id. */
  showName: string;
  chargeVerification: ClubShowChargeVerification;
  /** Null when the club has no payout row yet for this show. */
  settlement: PayoutSettlementRow | null;
  orderCount: number;
}

/** One show's charge-coverage statement across its orders. */
function showChargeVerification(
  orders: FinancialReconciliationOrder[]
): ClubShowChargeVerification {
  // No stripe_orders rows for this show. NOTE this is NOT "no charge record":
  // the entries may all have been paid by check at the desk, which is real
  // banked money with no Stripe row behind it.
  if (orders.length === 0) return 'NoStripeCharges';
  // Degrade if ANY order lacks its fee snapshot — never claim show-wide
  // coverage the record cannot back up. The LABEL must stay a coverage
  // statement for the same reason: "some missing" survives this aggregation
  // truthfully, a flat negative would not.
  return orders.some(order => resolveOrderChargeVerification(order) === 'NoFeeBreakdown')
    ? 'SomeFeeBreakdownsMissing'
    : 'AllFeeBreakdowns';
}

/** Ordering facts for a reconciliation payout row. */
function readPayoutOrdering(payout: FinancialReconciliationPayout) {
  return { status: payout.status, createdAt: payout.createdAt, id: payout.payoutId };
}

/**
 * Build one reconciliation row per show the club has EITHER a Stripe order OR
 * a payout row for, sorted by most recent activity first.
 */
export function buildClubShowReconciliationRows(
  orders: FinancialReconciliationOrder[],
  payouts: FinancialReconciliationPayout[],
  accountState: PayoutsAccountState,
  showNamesById: Map<string, string> = new Map()
): ClubShowReconciliationRow[] {
  const ordersByShow = new Map<string, FinancialReconciliationOrder[]>();
  for (const order of orders) {
    if (!order.showId) continue;
    const list = ordersByShow.get(order.showId) ?? [];
    list.push(order);
    ordersByShow.set(order.showId, list);
  }

  // A show can carry SEVERAL payout rows: the cron leaves a failed row in place
  // and inserts a new one on retry. Selection follows the same rule the
  // reconciliation RPC uses, not a local max(createdAt) -- see
  // payoutSupersession.ts for why those two differ and where it hurt.
  const payoutRowsByShow = new Map<string, FinancialReconciliationPayout[]>();
  for (const payout of payouts) {
    if (!payout.showId) continue;
    const list = payoutRowsByShow.get(payout.showId) ?? [];
    list.push(payout);
    payoutRowsByShow.set(payout.showId, list);
  }

  const payoutByShow = new Map<string, FinancialReconciliationPayout>();
  for (const [showId, rows] of payoutRowsByShow) {
    const authoritative = selectAuthoritativePayout(rows, readPayoutOrdering);
    if (authoritative) payoutByShow.set(showId, authoritative);
  }

  const showIds = new Set<string>([...ordersByShow.keys(), ...payoutByShow.keys()]);

  const rows: ClubShowReconciliationRow[] = [];
  for (const showId of showIds) {
    const showOrders = ordersByShow.get(showId) ?? [];
    const chargeVerification = showChargeVerification(showOrders);
    const payout = payoutByShow.get(showId);
    const settlement = payout ? resolvePayoutSettlement(payout, accountState) : null;

    rows.push({
      showId,
      showName: showNamesById.get(showId) ?? 'Show',
      chargeVerification,
      settlement,
      orderCount: showOrders.length,
    });
  }

  // Most recently active show first: prefer the payout's createdAt, fall back
  // to the latest order's createdAt.
  rows.sort((a, b) => {
    const aTime =
      payoutByShow.get(a.showId)?.createdAt ??
      ordersByShow.get(a.showId)?.slice(-1)[0]?.createdAt ??
      '';
    const bTime =
      payoutByShow.get(b.showId)?.createdAt ??
      ordersByShow.get(b.showId)?.slice(-1)[0]?.createdAt ??
      '';
    return bTime.localeCompare(aTime);
  });

  return rows;
}
