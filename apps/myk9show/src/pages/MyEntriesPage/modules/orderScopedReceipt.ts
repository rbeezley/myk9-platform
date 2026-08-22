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
  /** Gross charged, in dollars: entrySubtotal + platformFee. */
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

  // Prefer the order's own snapshot columns; fall back to summing the rows we
  // just proved complete, so an order written before those columns existed
  // still balances instead of printing a fee row it cannot justify.
  const entrySubtotalCents =
    order.entrySubtotalCents ??
    Math.round(classes.reduce((sum, classEntry) => sum + classEntry.fee, 0) * 100);
  const platformFeeCents = order.platformFeeCents ?? order.amountCents - entrySubtotalCents;
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
    amountCharged: order.amountCents / 100,
    refunded: refundedCents / 100,
    netPaid: (order.amountCents - refundedCents) / 100,
    // Keep `totalFee` meaning what the rest of MyEntry means by it — the entry
    // fees — rather than quietly redefining it as the amount charged.
    totalFee: entrySubtotalCents / 100,
  };
}
