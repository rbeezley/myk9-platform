// Server-side class gate for stripe-checkout (MYK9-656, acceptance criterion 3).
//
// The cart page drops closed or full lines when it loads (the
// `reconcile_cart_closed_classes` RPC), but a class can close between that load
// and the Pay click, and a direct call to stripe-checkout skips the page
// altogether. create_online_paid_entry gates fullness after payment (overflow
// is refunded) but never class closure, so without this a cancelled or already
// run class could be charged and entered.
//
// The rule is not restated here. `class_entry_availability` (migration
// 20260925004700) returns `self_service_block` per class, the same verdict the
// reconcile RPC drops lines on; this only decides which cart lines it applies
// to. Finish Payment lines (entry_id set) settle an entry that already exists
// and are never blocked, as in the reconcile.
//
// Refusing rather than deleting is deliberate: the client reloads the cart on
// a 409, and that reload's reconcile removes the lines AND tells the exhibitor
// which and why. Deleting here would remove them with no explanation.

export interface CartLineForClassGate {
  class_id: string;
  entry_id?: string | null;
}

export interface ClassAvailabilityForGate {
  class_id: string;
  self_service_block: string | null;
}

export const CART_CLASS_CLOSED_MESSAGE =
  'A class in your cart has closed or filled since you added it. Review your cart and try again.';

/** Class ids of the cart's NEW lines, the only ones the gate reads. */
export function newLineClassIds(items: readonly CartLineForClassGate[]): string[] {
  return [...new Set(items.filter(item => !item.entry_id).map(item => item.class_id))];
}

/** True when any new cart line is in a class self-service can no longer buy. */
export function cartHasBlockedClass(
  items: readonly CartLineForClassGate[],
  availability: readonly ClassAvailabilityForGate[]
): boolean {
  const blocked = new Set(
    availability.filter(row => row.self_service_block !== null).map(row => row.class_id)
  );
  return items.some(item => !item.entry_id && blocked.has(item.class_id));
}
