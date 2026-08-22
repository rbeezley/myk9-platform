import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import type { MyEntry } from './my-entries-types';

export interface OrderScopedReceiptEntry extends MyEntry {
  orderId: string;
  currency: string;
  paymentReference: string | null;
  /** Sum of the entry fees this order paid for, in dollars. */
  entrySubtotal: number;
  /** Platform fee billed on top of the entry fees, in dollars. */
  platformFee: number;
  /**
   * Charged for lines the capacity split sent to the wait list and refunded
   * immediately, in dollars. Without its own row the receipt states a gross
   * its line items cannot reach.
   */
  overflowCharged: number;
  /** Gross charged: entrySubtotal + platformFee + overflowCharged. */
  amountCharged: number;
  /** Everything handed back against this order, in dollars. */
  refunded: number;
  /** amountCharged - refunded. What the exhibitor actually paid. */
  netPaid: number;
}

/** True once any money came back, whether post-hoc or as a cart overflow. */
export function orderHasRefund(order: EntryReceiptOrder): boolean {
  // Read the refund COLUMNS, never `status`: orderSnapshot.ts records that a
  // partially refunded order keeps status = 'succeeded', so a status check
  // reports "Paid" over money that was returned.
  return order.refundedCents > 0 || order.makeWholeRefundedCents > 0;
}

/**
 * Projects one registration card onto the exact rows and amounts of a Stripe
 * order.
 *
 * Returns null when the projection cannot be made truthfully. That is not an
 * error state — the caller falls back to the card-derived receipt, which is
 * what a cash, check or offline registration has always printed.
 */
export function buildOrderScopedReceipt(
  entry: MyEntry,
  order: EntryReceiptOrder | null
): OrderScopedReceiptEntry | null {
  if (!order || order.entryIds.length === 0) return null;

  const entryIds = new Set(order.entryIds);
  const classes = entry.classes.filter(classEntry => entryIds.has(classEntry.id));

  // Every row the order paid for must be present AND resolved. A row still
  // joining its class replicates as `unresolved` with the name "Unknown Class"
  // and a real fee — present enough to satisfy a bare id check, and useless on
  // a printed receipt. Refusing here sends the caller to the card fallback
  // rather than printing a priced line nobody can identify.
  if (classes.length !== entryIds.size || classes.some(classEntry => classEntry.unresolved)) {
    return null;
  }

  const dogs = entry.dogs
    .map(dog => ({
      ...dog,
      classes: dog.classes.filter(classEntry => entryIds.has(classEntry.id)),
    }))
    .filter(dog => dog.classes.length > 0);

  // The documented tie-out (_shared/orderSnapshot.ts):
  //
  //   amount_cents == entry_subtotal_cents + platform_fee_cents
  //                 + make_whole_refunded_cents
  //
  // The snapshot columns describe only the lines that were ACCEPTED, while
  // amount_cents is the whole session including lines the capacity split sent
  // to the wait list and refunded on the spot. So the overflow needs a row of
  // its own; without it the receipt states a gross its line items cannot
  // reach, by exactly the amount that was handed straight back.
  const entrySubtotalCents =
    order.entrySubtotalCents ??
    Math.round(classes.reduce((sum, classEntry) => sum + classEntry.fee, 0) * 100);
  const overflowChargedCents = order.makeWholeRefundedCents;
  // A legacy order predating the snapshot columns has to derive the fee. Clamp
  // at zero: if a class fee was edited upward after payment the rows can now
  // sum past what was charged, and a negative "Platform fee" is a worse lie
  // than omitting the line.
  const platformFeeCents =
    order.platformFeeCents ??
    Math.max(0, order.amountCents - entrySubtotalCents - overflowChargedCents);
  const refundedCents = order.refundedCents + order.makeWholeRefundedCents;

  return {
    ...entry,
    orderId: order.id,
    classes,
    dogs,
    dogName: dogs.length > 0 ? dogs.map(dog => dog.dogName).join(' & ') : entry.dogName,
    currency: order.currency,
    paymentReference: order.reference,
    entrySubtotal: entrySubtotalCents / 100,
    platformFee: platformFeeCents / 100,
    overflowCharged: overflowChargedCents / 100,
    amountCharged: order.amountCents / 100,
    refunded: refundedCents / 100,
    netPaid: (order.amountCents - refundedCents) / 100,
    // Keep `totalFee` meaning what the rest of MyEntry means by it — the entry
    // fees — rather than quietly redefining it as the amount charged.
    totalFee: entrySubtotalCents / 100,
  };
}
