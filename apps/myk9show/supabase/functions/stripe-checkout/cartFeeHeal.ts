// Fee-drift healer for stripe-checkout (MYK9-2447). Deno-free so it runs under vitest.
//
// When a cart line's stored entry_fee_cents differs from authoritative pricing,
// checkout heals the stored fee and answers 409 so the exhibitor reviews the new
// price; the retry then prices the healed rows. Two writes, two failure rules:
//
// - A failed LINE write must refuse checkout, and not with the 409 "fees were
//   updated" (that is untrue, and every retry would drift again: the loop).
//   Nor may it carry on to Stripe with the server price: the webhook's
//   sessionCartGuard requires the stored line fees to sum to the cart subtotal
//   that linkCartCheckout writes, so a paid page over unhealed lines would be
//   rejected as stale and the exhibitor charged with no entries recorded.
// - A failed CART write is logged and does not change the answer: the lines are
//   healed (the next attempt does not drift), linkCartCheckout rewrites the
//   totals, and the prior page is expired at Stripe below either way.

export interface FeeHealWriteResult {
  error: { message: string; code?: string } | null;
}

export interface DriftedLine {
  itemId: string;
  authoritativeCents: number;
}

export interface FeeHealDeps {
  writeLineFee: (itemId: string, cents: number) => PromiseLike<FeeHealWriteResult>;
  writeCartTotals: () => PromiseLike<FeeHealWriteResult>;
  /** Expires the cart's prior Checkout page, if any; a failure is swallowed. */
  expirePriorSession: () => Promise<unknown>;
  logError: (message: string, error: unknown) => void;
}

export type FeeHealOutcome = { kind: 'healed' } | { kind: 'heal_failed'; failedItemIds: string[] };

export const FEES_HEALED_MESSAGE =
  'Entry fees were updated to current show pricing — review your entry and try again.';
export const FEES_HEAL_FAILED_MESSAGE = 'Could not confirm the entry fees. Please try again.';

export async function healDriftedCart(
  cartId: string,
  lines: DriftedLine[],
  deps: FeeHealDeps
): Promise<FeeHealOutcome> {
  const failedItemIds: string[] = [];
  for (const { itemId, authoritativeCents } of lines) {
    const { error } = await deps.writeLineFee(itemId, authoritativeCents);
    if (error) {
      failedItemIds.push(itemId);
      deps.logError(`Cart ${cartId}: could not heal the fee on line ${itemId}:`, error);
    }
  }
  const { error: cartError } = await deps.writeCartTotals();
  if (cartError) {
    deps.logError(`Cart ${cartId}: could not write healed totals:`, cartError);
  }
  try {
    await deps.expirePriorSession();
  } catch {
    // Already expired/paid/foreign: the lines changed, so the webhook's
    // sessionCartGuard rejects a payment on the old page.
  }
  return failedItemIds.length > 0 ? { kind: 'heal_failed', failedItemIds } : { kind: 'healed' };
}
