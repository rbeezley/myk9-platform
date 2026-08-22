import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import type { MyEntry } from './my-entries-types';

export interface OrderScopedReceiptEntry extends MyEntry {
  currency: string;
  paymentReference: string | null;
}

/**
 * Projects one registration card onto the exact rows and amount charged by a
 * Stripe order. A null order preserves the existing direct-from-card receipt.
 */
export function buildOrderScopedReceipt(
  entry: MyEntry,
  order: EntryReceiptOrder | null
): OrderScopedReceiptEntry {
  if (!order) {
    return { ...entry, currency: 'usd', paymentReference: null };
  }

  const entryIds = new Set(order.entryIds);
  const classes = entry.classes.filter(classEntry => entryIds.has(classEntry.id));
  const dogs = entry.dogs
    .map(dog => ({
      ...dog,
      classes: dog.classes.filter(classEntry => entryIds.has(classEntry.id)),
    }))
    .filter(dog => dog.classes.length > 0);

  return {
    ...entry,
    id: order.id,
    classes,
    dogs,
    dogName: dogs.length > 0 ? dogs.map(dog => dog.dogName).join(' & ') : entry.dogName,
    totalFee: order.amountCents / 100,
    currency: order.currency,
    paymentReference: order.reference,
  };
}
