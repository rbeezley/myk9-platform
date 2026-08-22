import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import type { MyEntry } from './my-entries-types';

export interface OrderScopedReceiptEntry extends MyEntry {
  orderId: string;
  currency: string;
  paymentReference: string | null;
}

/**
 * Projects one registration card onto the exact rows and amount charged by a
 * Stripe order. A missing or only partially replicated order cannot safely
 * produce a receipt because its full charged amount would be misleading.
 */
export function buildOrderScopedReceipt(
  entry: MyEntry,
  order: EntryReceiptOrder | null
): OrderScopedReceiptEntry | null {
  if (!order || order.entryIds.length === 0) return null;

  const entryIds = new Set(order.entryIds);
  const classes = entry.classes.filter(classEntry => entryIds.has(classEntry.id));
  const replicatedIds = new Set(classes.map(classEntry => classEntry.id));
  if (
    replicatedIds.size !== entryIds.size ||
    [...entryIds].some(entryId => !replicatedIds.has(entryId))
  ) {
    return null;
  }
  const dogs = entry.dogs
    .map(dog => ({
      ...dog,
      classes: dog.classes.filter(classEntry => entryIds.has(classEntry.id)),
    }))
    .filter(dog => dog.classes.length > 0);

  return {
    ...entry,
    orderId: order.id,
    classes,
    dogs,
    dogName: dogs.length > 0 ? dogs.map(dog => dog.dogName).join(' & ') : entry.dogName,
    totalFee: order.amountCents / 100,
    currency: order.currency,
    paymentReference: order.reference,
  };
}
