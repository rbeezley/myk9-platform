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
  paymentStatusLabel,
} from '@/features/payments/moneyPresentation';
import { orderHasRefund } from './orderScopedReceipt';

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
 * would print "Paid" over money that was handed back. Same derivation the
 * receipt dialog already uses (`MyEntriesDialogs.receiptPaymentStatus`).
 */
function scopedPaymentStatus(order: EntryReceiptOrder, netCents: number): string {
  if (!orderHasRefund(order)) return paymentStatusLabel(order.status);
  return netCents <= 0 ? 'Refunded' : 'Partially refunded';
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
export function buildScopedPaymentFacts(order: EntryReceiptOrder): ScopedPaymentFacts {
  const currency = order.currency;
  // Both refund columns. `make_whole_refunded_cents` is the cart-overflow
  // auto-refund, which `amount_cents` is deliberately NOT netted by, so
  // omitting it overstates what the exhibitor kept by exactly the amount that
  // was handed straight back.
  const refundedCents = order.refundedCents + order.makeWholeRefundedCents;
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
    statusLabel: scopedPaymentStatus(order, netCents),
    rows,
    entriesCovered: order.entryIds.length,
  };
}
