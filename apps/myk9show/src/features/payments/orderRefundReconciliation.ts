/**
 * The ONE answer to "how much of this order came back?".
 *
 * Two different actors record the same refund, at different times and in
 * different columns:
 *
 *  - `stripe-refund-entry/index.ts` (an app refund) writes
 *    `entries.refund_amount` synchronously and never touches `stripe_orders`.
 *    `refunded_cents` catches up only when Stripe delivers `charge.refunded`
 *    and the webhook's `recordOrderRefundCents` runs.
 *  - A Stripe DASHBOARD refund lags the other way: `refunded_cents` is set and
 *    the entries are never touched. The webhook alerts an admin to reconcile
 *    it by hand ("Dashboard refund needs reconciling before payout").
 *
 * Before MYK9-428 the receipt dialog read only the order columns and the My
 * Payments ledger read only the entries, so the same order stated two
 * different refunds depending on which surface you were looking at, in both
 * directions. Every surface now derives from this module, so they cannot
 * disagree by construction — adding a source here reaches all of them at once.
 *
 * @module features/payments/orderRefundReconciliation
 */

import { isRefundedPaymentStatus, paymentStatusLabel } from './paymentStatusLabels';

/**
 * Every refund signal one Stripe order carries, from both writers.
 *
 * Deliberately a plain data shape rather than `EntryReceiptOrder`: the My
 * Payments ledger builds its rows from a different row type and must be able
 * to reach the same derivation without adopting the receipt's whole model.
 */
export interface OrderRefundSources {
  /** `stripe_orders.amount_cents` — the GROSS charged, never netted. */
  amountCents: number;
  /** `stripe_orders.status`. Only ever consulted for the legacy fallback. */
  status: string;
  /** `stripe_orders.refunded_cents` — post-hoc refunds, as the WEBHOOK saw them. */
  refundedCents: number;
  /** `stripe_orders.make_whole_refunded_cents` — the cart-overflow auto-refund. */
  makeWholeRefundedCents: number;
  /** Sum of `entries.refund_amount` over this order's rows, as the APP wrote it. */
  entryRefundedCents: number;
}

/**
 * Post-hoc refunds, resolved across the two writers that record them.
 *
 * Taking the larger means a surface can be EARLY but never understates what
 * came back. Understating is the harmful direction: it tells an exhibitor they
 * paid more than they kept. Being early costs nothing — both figures converge
 * as soon as the lagging writer catches up.
 */
function resolvePostHocRefundCents(sources: OrderRefundSources): number {
  const recorded = Math.max(sources.refundedCents, sources.entryRefundedCents);
  if (recorded > 0) return recorded;

  // Legacy fallback, matching `buildPaymentDisplayRows`: an order predating the
  // snapshot columns can be `status = 'refunded'` with no refund figure
  // anywhere. My Payments already treats that as a full refund, so without this
  // a receipt would print "Amount paid $37.45" beside the word "Refunded" — a
  // document that contradicts itself and its own source row.
  //
  // Netting the overflow out keeps the two kinds of refund from double-counting
  // when they are the same money: a cart-overflow order is also
  // `status = 'refunded'`, and its whole gross already sits in
  // `make_whole_refunded_cents`.
  if (isRefundedPaymentStatus(sources.status)) {
    return Math.max(0, sources.amountCents - sources.makeWholeRefundedCents);
  }
  return 0;
}

/**
 * Everything handed back against this order, post-hoc refunds and cart-overflow
 * alike.
 *
 * `amount_cents` is deliberately NOT netted by `make_whole_refunded_cents`
 * (`_shared/orderSnapshot.ts`), so the overflow always ADDS here. Omitting it
 * overstates what the exhibitor kept by exactly the amount that was charged and
 * handed straight back in the same session.
 */
export function resolveOrderRefundedCents(sources: OrderRefundSources): number {
  return resolvePostHocRefundCents(sources) + sources.makeWholeRefundedCents;
}

/** `amountCents` less everything that came back. May be zero; see below. */
export function resolveOrderNetPaidCents(sources: OrderRefundSources): number {
  return sources.amountCents - resolveOrderRefundedCents(sources);
}

/**
 * The exhibitor-facing status for one order.
 *
 * `status` alone cannot answer this: `_shared/orderSnapshot.ts` records that a
 * PARTIALLY refunded order keeps `status = 'succeeded'`, so reading the column
 * would print "Paid" over money that was handed back. Driven off the RESOLVED
 * refund total rather than the order columns, so a refund one writer has not
 * booked yet still reads as refunded.
 *
 * Note the net is never the discriminator: zero net means "nothing happened"
 * and "everything was reversed" at once, so the refund total decides whether
 * money came back and the net only distinguishes full from partial.
 */
export function orderRefundStatusLabel(sources: OrderRefundSources): string {
  const refundedCents = resolveOrderRefundedCents(sources);
  if (refundedCents <= 0) return paymentStatusLabel(sources.status);
  return sources.amountCents - refundedCents <= 0 ? 'Refunded' : 'Partially refunded';
}
