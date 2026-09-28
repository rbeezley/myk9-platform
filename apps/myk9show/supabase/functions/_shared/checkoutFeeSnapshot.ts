/** A service-owned price and identity record for one Stripe Checkout Session. */
export interface CheckoutFeeSnapshotItem {
  id: string;
  dog_id: string;
  class_id: string;
  entry_id: string | null;
  handler_id: string | null;
  jump_height: string | null;
  special_requests: string | null;
  fee_cents: number;
}
export interface CheckoutFeeSnapshot {
  session_id: string;
  cart_id: string;
  show_id: string;
  exhibitor_id: string;
  subtotal_cents: number;
  platform_fee_cents: number;
  total_cents: number;
  items: CheckoutFeeSnapshotItem[];
}
type LiveItem = Omit<CheckoutFeeSnapshotItem, 'fee_cents'> & { entry_fee_cents: number };
interface LiveCart {
  id: string;
  show_id: string;
  exhibitor_id: string;
  items: LiveItem[];
}
type SnapshotValidation =
  { ok: true; feeByItem: Map<string, number> } | { ok: false; reason: string };
const integerCents = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function validateCheckoutFeeSnapshot(
  snapshot: CheckoutFeeSnapshot,
  cart: LiveCart,
  stripeTotalCents: number | null
): SnapshotValidation {
  if (
    snapshot.cart_id !== cart.id ||
    snapshot.show_id !== cart.show_id ||
    snapshot.exhibitor_id !== cart.exhibitor_id
  ) {
    return { ok: false, reason: 'Cart identity differs from the checkout snapshot' };
  }
  if (
    !integerCents(snapshot.subtotal_cents) ||
    !integerCents(snapshot.platform_fee_cents) ||
    !integerCents(snapshot.total_cents) ||
    snapshot.total_cents !== snapshot.subtotal_cents + snapshot.platform_fee_cents ||
    snapshot.total_cents !== stripeTotalCents
  ) {
    return { ok: false, reason: 'Stripe total differs from the frozen checkout total' };
  }
  if (
    !Array.isArray(snapshot.items) ||
    snapshot.items.length === 0 ||
    snapshot.items.length !== cart.items.length
  ) {
    return { ok: false, reason: 'Cart item count differs from the checkout snapshot' };
  }
  const liveById = new Map(cart.items.map(item => [item.id, item]));
  const feeByItem = new Map<string, number>();
  let subtotal = 0;
  for (const item of snapshot.items) {
    const live = liveById.get(item.id);
    if (
      !live ||
      feeByItem.has(item.id) ||
      !integerCents(item.fee_cents) ||
      item.dog_id !== live.dog_id ||
      item.class_id !== live.class_id ||
      item.entry_id !== live.entry_id ||
      item.handler_id !== live.handler_id ||
      item.jump_height !== live.jump_height ||
      item.special_requests !== live.special_requests
    ) {
      return { ok: false, reason: `Cart item ${item.id} differs from the checkout snapshot` };
    }
    feeByItem.set(item.id, item.fee_cents);
    subtotal += item.fee_cents;
  }
  if (subtotal !== snapshot.subtotal_cents) {
    return { ok: false, reason: 'Frozen item fees differ from the frozen subtotal' };
  }
  return { ok: true, feeByItem };
}
