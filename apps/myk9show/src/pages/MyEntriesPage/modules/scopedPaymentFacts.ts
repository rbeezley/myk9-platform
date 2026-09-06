/**
 * The payment facts a deep-linked "Receipt" has to state on arrival.
 *
 * My Payments' per-row Receipt link lands on My Shows carrying `?orderId=`.
 * The list narrows correctly and the banner explains the narrowing, but until
 * MYK9-420 the destination stated no amount, no date and no reference — a
 * control labelled Receipt produced a filtered list and nothing an exhibitor
 * could show as proof of payment.
 *
 * Kept separate from the component so every claim below is unit-testable
 * without rendering. These are assertions about money; they are exactly the
 * ones worth pinning.
 *
 * @module MyEntriesPage/modules/scopedPaymentFacts
 */

import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import {
  formatPaymentCents,
  formatPaymentDate,
  isRefundedPaymentStatus,
  paymentStatusLabel,
} from '@/features/payments/moneyPresentation';


export interface ScopedPaymentFactRow {
  label: string;
  value: string;
}

export interface ScopedPaymentFacts {
  /** Headline figure: the gross charged, or the net when money came back. */
  headlineLabel: string;
  headlineValue: string;
  /** Paid / Partially refunded / Refunded — never read from `status` alone. */
  statusLabel: string;
  /** Gross, refund and date/reference lines, in reading order. */
  rows: ScopedPaymentFactRow[];
  /** How many entry rows this order paid for. */
  entriesCovered: number;
}

/**
 * The exhibitor-facing status for one order.
 *
 * `status` alone cannot answer this: `_shared/orderSnapshot.ts` records that a
 * PARTIALLY refunded order keeps `status = 'succeeded'`, so reading the column
 * would print "Paid" over money that was handed back. Driven off the resolved
 * refund total rather than the order columns, so a refund the webhook has not
 * booked yet still reads as refunded.
 */
function scopedPaymentStatus(
  order: EntryReceiptOrder,
  refundedCents: number,
  netCents: number
): string {
  if (refundedCents <= 0) return paymentStatusLabel(order.status);
  return netCents <= 0 ? 'Refunded' : 'Partially refunded';
}

/**
 * Post-hoc refunds, resolved across the two writers that record them.
 *
 * `stripe_orders.refunded_cents` and the sum of `entries.refund_amount`
 * describe the SAME money and disagree in both directions:
 *
 *  - An app refund writes the entries synchronously; `refunded_cents` waits
 *    for Stripe to deliver `charge.refunded`.
 *  - A Stripe DASHBOARD refund writes `refunded_cents` and never touches the
 *    entries — the webhook alerts an admin to reconcile it by hand.
 *
 * Taking the larger means the receipt can be early but never understates what
 * came back. Understating is the harmful direction: it tells an exhibitor they
 * paid more than they kept.
 */
function resolvePostHocRefundCents(order: EntryReceiptOrder, entryRefundedCents: number): number {
  const recorded = Math.max(order.refundedCents, entryRefundedCents);
  if (recorded > 0) return recorded;

  // Legacy fallback, matching `buildPaymentDisplayRows`: an order that predates
  // the snapshot columns can be `status = 'refunded'` with no refund figure
  // anywhere. My Payments treats that as a full refund, so without this the
  // receipt would print "Amount paid $37.45" beside the word "Refunded" — a
  // document that contradicts itself and its own source row.
  //
  // Netting the overflow out keeps the two kinds of refund from double-counting
  // when they are the same money: a cart-overflow order is also
  // `status = 'refunded'`, and its whole gross already sits in
  // `make_whole_refunded_cents`.
  if (isRefundedPaymentStatus(order.status)) {
    return Math.max(0, order.amountCents - order.makeWholeRefundedCents);
  }
  return 0;
}

/**
 * Project one Stripe order onto the lines the destination panel prints.
 *
 * Two invariants this deliberately preserves:
 *
 *  - The gross line is `amountCents` verbatim, formatted with the SAME helper
 *    My Payments formats its charge row with. That is what makes the two
 *    screens reconcile on sight (MYK9-420 AC2); deriving it here from the
 *    snapshot columns instead would let them drift.
 *  - A refunded order never shows a bare figure. `netPaid` alone is zero in
 *    two completely different worlds — nothing happened, and everything was
 *    reversed — so gross and refund are always printed alongside it and the
 *    headline switches label rather than silently changing meaning.
 */
export function buildScopedPaymentFacts(
  order: EntryReceiptOrder,
  entryRefundedCents: number
): ScopedPaymentFacts {
  const currency = order.currency;
  // Post-hoc refunds plus the cart-overflow auto-refund. `amount_cents` is
  // deliberately NOT netted by `make_whole_refunded_cents`, so omitting it
  // overstates what the exhibitor kept by exactly the amount that was handed
  // straight back. The two are separate money and always add.
  const refundedCents =
    resolvePostHocRefundCents(order, entryRefundedCents) + order.makeWholeRefundedCents;
  const netCents = order.amountCents - refundedCents;
  const refunded = refundedCents > 0;

  const rows: ScopedPaymentFactRow[] = [];
  if (refunded) {
    rows.push({ label: 'Amount charged', value: formatPaymentCents(order.amountCents, currency) });
    rows.push({ label: 'Refunded', value: `-${formatPaymentCents(refundedCents, currency)}` });
  }
  rows.push({ label: 'Paid on', value: formatPaymentDate(order.paidOn) });
  if (refunded && order.refundedAt) {
    rows.push({ label: 'Refunded on', value: formatPaymentDate(order.refundedAt) });
  }
  // The reference an exhibitor can quote to a club or to support. The payment
  // intent is the one both Stripe and the club's dashboard recognise; the
  // order id is the fallback for a row that predates it.
  rows.push({ label: 'Reference', value: order.reference ?? order.id });

  return {
    headlineLabel: refunded ? 'Net paid' : 'Amount paid',
    headlineValue: formatPaymentCents(netCents, currency),
    statusLabel: scopedPaymentStatus(order, refundedCents, netCents),
    rows,
    entriesCovered: order.entryIds.length,
  };
}
