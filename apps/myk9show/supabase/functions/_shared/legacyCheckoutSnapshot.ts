import type { CheckoutFeeSnapshot, CheckoutFeeSnapshotItem } from './checkoutFeeSnapshot.ts';

type LegacyItem = Omit<CheckoutFeeSnapshotItem, 'fee_cents'> & { entry_fee_cents: number };
interface LegacyCart {
  id: string;
  show_id: string;
  exhibitor_id: string;
  items: LegacyItem[];
}

const validCents = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/**
 * During the server rollout, a paid Session can predate the snapshot table.
 * Its Stripe line items are the immutable charge record. Only reconstruct a
 * snapshot when every current cart line still matches a charged line amount;
 * the cart's Session link and identity guard are checked separately.
 */
export function buildLegacyCheckoutSnapshot(
  sessionId: string,
  cart: LegacyCart,
  stripeLineAmountsCents: number[],
  stripeTotalCents: number
): CheckoutFeeSnapshot | null {
  if (!cart.items.length || !validCents(stripeTotalCents)) return null;
  const itemAmounts = cart.items.map(item => item.entry_fee_cents);
  if (itemAmounts.some(amount => !validCents(amount))) return null;
  const subtotal = itemAmounts.reduce((sum, amount) => sum + amount, 0);
  const platformFee = stripeTotalCents - subtotal;
  if (!validCents(platformFee)) return null;
  const chargedItems = stripeLineAmountsCents.slice(0, cart.items.length);
  const chargedPlatform = stripeLineAmountsCents.slice(cart.items.length);
  const sortedChargedItems = [...chargedItems].sort((a, b) => a - b);
  const sortedCartItems = [...itemAmounts].sort((a, b) => a - b);
  if (
    chargedItems.length !== cart.items.length ||
    chargedItems.some(amount => !validCents(amount)) ||
    sortedChargedItems.some((amount, index) => amount !== sortedCartItems[index]) ||
    (platformFee > 0
      ? chargedPlatform.length !== 1 || chargedPlatform[0] !== platformFee
      : chargedPlatform.length !== 0)
  ) {
    return null;
  }
  return {
    session_id: sessionId,
    cart_id: cart.id,
    show_id: cart.show_id,
    exhibitor_id: cart.exhibitor_id,
    subtotal_cents: subtotal,
    platform_fee_cents: platformFee,
    total_cents: stripeTotalCents,
    items: cart.items.map(item => ({
      id: item.id,
      dog_id: item.dog_id,
      class_id: item.class_id,
      entry_id: item.entry_id,
      handler_id: item.handler_id,
      jump_height: item.jump_height,
      special_requests: item.special_requests,
      fee_cents: item.entry_fee_cents,
    })),
  };
}
