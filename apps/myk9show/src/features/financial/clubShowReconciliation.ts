// Club-scoped per-show reconciliation rows (unified-financial-dashboard,
// MYK9-54, task 3.2). Pure TypeScript only — no React, no supabase.
//
// Groups the club-scoped reconciliation ORDER rows (stripe_orders, charge
// facts) and PAYOUT rows (show_payouts, settlement facts) by show so the
// treasurer sees one row per show with:
//   - net:               the club's net entry-fee transfer for that show
//                        (entry subtotal, i.e. charged amount less the
//                        platform's fee, less any POST-HOC refunded portion — see
//                        clubNetContributionCents). Independent of payout
//                        SETTLEMENT timing — a show can be charge-verified
//                        before its payout settles.
//   - chargeVerification: StripeRecord / NoStripeRecord across the show's Stripe orders.
//                        StripeRecord means EVERY order for the show carries a
//                        Stripe snapshot; if any order has no snapshot (legacy,
//                        desk-recorded), or the show has no online orders at
//                        all, the row reads NoStripeRecord. INTENT: the club card must
//                        never imply a Stripe verification it cannot back up, so
//                        the aggregate degrades to NoStripeRecord rather than up to
//                        StripeRecord. There is no "Mismatch" — see
//                        chargeVerification.ts for why the amount-tie-out
//                        inference was removed.
//   - settlement:         the existing payout-settlement row (badge label,
//                        state, copyable stripe_transfer_id), when the club
//                        has a payout row for that show.
//
// A show's net is PENDING (never $0, never silently 'StripeRecord') whenever any
// of its orders has an uncaptured Stripe processing fee — the same
// null-means-pending contract as derivePlatformIncome in financialSummary.ts.
import { resolveOrderChargeVerification } from './chargeVerification';
import type {
  FinancialReconciliationOrder,
  FinancialReconciliationPayout,
} from './financialReconciliation';
import { resolvePayoutSettlement, type PayoutSettlementRow } from './payoutSettlement';
import { selectAuthoritativePayout } from './payoutSupersession';
import type { PayoutsAccountState } from '@/features/payments/payoutBadge';

/**
 * 'Unknown' is not a weaker 'NoStripeRecord'. NoStripeRecord is a positive statement -- the
 * charge is recorded, we simply hold no Stripe snapshot for it, which is the
 * normal shape of a desk payment or a legacy order. A show with NO order rows
 * at all supports neither statement, and the card's INTENT header is explicit
 * that a missing fact must read as missing.
 *
 * `ClubShowNet` already had a `pending` arm for exactly this case, so the same
 * input used to produce an honest "net pending" beside a confident 'NoStripeRecord'.
 */
export type ClubShowChargeVerification = 'StripeRecord' | 'NoStripeRecord' | 'Unknown';

/** Never a bare number: a pending processing fee must read as pending, not $0. */
export type ClubShowNet = { status: 'available'; netCents: number } | { status: 'pending' };

export interface ClubShowReconciliationRow {
  showId: string;
  /** Falls back to a generic label when no show name is known for this id. */
  showName: string;
  net: ClubShowNet;
  chargeVerification: ClubShowChargeVerification;
  /** Null when the club has no payout row yet for this show. */
  settlement: PayoutSettlementRow | null;
  orderCount: number;
}

/**
 * One order's contribution to the club's net entry money for a show:
 *
 *     max(0, entrySubtotalCents - postHocRefundedCents)
 *
 * ONLY THE POST-HOC REFUND IS SUBTRACTED. `refundedCents` used to conflate
 * post-hoc refunds with cart-overflow MAKE-WHOLE refunds, which double-penalized
 * the club: a $50.00 accepted subtotal on a cart with a $40.00 overflow refund
 * reported $10.00 net when the club is owed the full $50.00 — the overflow money
 * was never part of the club's entry fees, never transferred, and returning it
 * costs the club nothing. With the explicit split (migration 20260717122000)
 * `refundedCents` IS the post-hoc total, so the make-whole portion is correctly
 * out of this formula.
 *
 * WHY THIS EXACT FORMULA — it is the same arithmetic the payout cron uses to
 * decide what to transfer, so the treasurer can read the net and the
 * "Transferred:" figure beside it as the same number. `calculateShowPayoutCents`
 * (supabase/functions/_shared/payoutCalc.ts) sums
 * `max(0, entryFeeCents - refundCents)` over the show's online entries, and
 * cron-process-payouts recomputes that at transfer time — so a refund issued
 * BEFORE the transfer shrinks the transfer by exactly the refunded amount.
 *
 * The floor at 0 is not defensive padding, it is required: a SHOW-level refund
 * (stripe-refund-show) refunds the full remaining charge — entry fees AND the
 * platform fee — so `refundedCents` can legitimately exceed `entrySubtotalCents`.
 * The club's share bottoms out at zero; the platform absorbs the fee portion.
 * (A per-ENTRY refund is capped at the entry fee by validateRefund, so it never
 * overshoots.)
 *
 * Refunds accepted AFTER the transfer are absorbed by the platform and do not
 * claw back the club's money — but refunds are rejected once the payout is
 * `processing` or `completed` (validateRefund: payout_in_progress /
 * payout_already_sent), so a settled show cannot drift below its transfer here.
 */
export function clubNetContributionCents(
  entrySubtotalCents: number,
  postHocRefundedCents: number
): number {
  return Math.max(0, entrySubtotalCents - postHocRefundedCents);
}

/** Aggregate one show's orders into its net-to-club figure and charge state. */
function aggregateShowOrders(orders: FinancialReconciliationOrder[]): {
  net: ClubShowNet;
  chargeVerification: ClubShowChargeVerification;
} {
  if (orders.length === 0) {
    // No Stripe trace at all for this show. Net is unknown rather than a
    // misleading $0, and the charge state is Unknown rather than NoStripeRecord:
    // there is no charge here to attest to.
    return { net: { status: 'pending' }, chargeVerification: 'Unknown' };
  }

  let netCents = 0;
  let anyPending = false;
  let anyUnverified = false;

  for (const order of orders) {
    if (order.stripeProcessingFeeCents == null) anyPending = true;
    // Degrade to NoStripeRecord if ANY order lacks a Stripe snapshot — never claim a
    // show-wide Stripe verification the record cannot back up.
    if (resolveOrderChargeVerification(order) === 'NoStripeRecord') anyUnverified = true;
    // Net-to-club is the entry subtotal (the ACCEPTED, paid lines) MINUS only the
    // POST-HOC refunded portion — see clubNetContributionCents for why that ties
    // to the transfer and why a cart-overflow make-whole refund must NOT reduce
    // it. When the snapshot is missing, treat that order as pending rather than
    // assuming $0 for it.
    if (order.entrySubtotalCents == null) {
      anyPending = true;
    } else {
      netCents += clubNetContributionCents(order.entrySubtotalCents, order.refundedCents);
    }
  }

  const net: ClubShowNet = anyPending ? { status: 'pending' } : { status: 'available', netCents };
  const chargeVerification: ClubShowChargeVerification = anyUnverified ? 'NoStripeRecord' : 'StripeRecord';
  return { net, chargeVerification };
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
    const { net, chargeVerification } = aggregateShowOrders(showOrders);
    const payout = payoutByShow.get(showId);
    const settlement = payout ? resolvePayoutSettlement(payout, accountState) : null;

    rows.push({
      showId,
      showName: showNamesById.get(showId) ?? 'Show',
      net,
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
