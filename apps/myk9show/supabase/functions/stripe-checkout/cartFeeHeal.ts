// Fee-drift healer for stripe-checkout (MYK9-2447). Deno-free so it runs under vitest.
//
// When a cart line's stored entry_fee_cents differs from authoritative pricing,
// checkout heals the stored fees and answers 409 so the exhibitor reviews the new
// price; the retry then prices the healed rows. The order is the safety:
//
// 1. Retire the prior Checkout page FIRST (the class gate's release check). The
//    webhook's sessionCartGuard requires the stored line fees to sum to the cart
//    subtotal, so changing fees under a page that is complete (payment
//    processing) or not confirmed expired would get that payment rejected as
//    stale: charged, no entries. A blocked release leaves the cart untouched.
//    Stripe cannot join a database transaction, so this stays a separate step.
// 2. Then ONE transaction (heal_cart_fees, MYK9-2455) writes every line, the
//    totals and the cleared page link, or nothing. It refuses unless this
//    request still holds the checkout lease and the cart and the page it links
//    are the ones it read: a heal that outlived its lease must never clear the
//    page a retry has since linked (sessionCartGuard would reject that payment).
//
// A failed heal answers heal_failed, never the 409 "fees were updated" (that
// would be untrue); because nothing was written, the retry finds the same drift
// and heals it. A refusal answers the cart-changed 409 so the cart page reloads.
// Nor does checkout carry on to Stripe with the server price: a page paid over
// unhealed lines would be rejected by the same guard.

import type { PriorSessionRelease } from '../_shared/cartClassGate.ts';
import {
  CART_CHANGED_MESSAGE,
  type CartFeeHealResult,
  type DriftedLine,
} from '../_shared/cartSpotHold.ts';

export interface FeeHealDeps {
  releasePriorSession: () => Promise<PriorSessionRelease>;
  /** heal_cart_fees: every line, the totals and the page link, in one transaction. */
  applyHeal: (lines: readonly DriftedLine[]) => PromiseLike<CartFeeHealResult>;
  logError: (message: string, error: unknown) => void;
}

export type FeeHealOutcome =
  | { kind: 'healed' }
  | { kind: 'heal_failed' }
  | { kind: 'cart_changed' }
  | { kind: 'blocked'; status: 409 | 503; error: string };

export const FEES_HEALED_MESSAGE =
  'Entry fees were updated to current show pricing — review your entry and try again.';
export const FEES_HEAL_FAILED_MESSAGE = 'Could not confirm the entry fees. Please try again.';

export async function healDriftedCart(
  cartId: string,
  lines: readonly DriftedLine[],
  deps: FeeHealDeps
): Promise<FeeHealOutcome> {
  const release = await deps.releasePriorSession();
  if (release.kind === 'blocked') {
    deps.logError(`Cart ${cartId}: fee heal not started:`, release.diagnostic);
    return { kind: 'blocked', status: release.status, error: release.error };
  }
  const result = await deps.applyHeal(lines);
  if (result.kind === 'refused') {
    deps.logError(`Cart ${cartId}: fee heal refused, nothing written:`, result.reason);
    return { kind: 'cart_changed' };
  }
  if (result.kind === 'error') {
    deps.logError(
      `Cart ${cartId}: could not heal the entry fees, nothing written:`,
      result.message
    );
    return { kind: 'heal_failed' };
  }
  return { kind: 'healed' };
}

/** The answer stripe-checkout sends for each heal outcome; every one stops checkout. */
export function feeHealResponse(outcome: FeeHealOutcome): {
  status: number;
  body: { error: string };
} {
  switch (outcome.kind) {
    case 'blocked':
      return { status: outcome.status, body: { error: outcome.error } };
    case 'heal_failed':
      return { status: 500, body: { error: FEES_HEAL_FAILED_MESSAGE } };
    case 'cart_changed':
      return { status: 409, body: { error: CART_CHANGED_MESSAGE } };
    case 'healed':
      return { status: 409, body: { error: FEES_HEALED_MESSAGE } };
  }
}
