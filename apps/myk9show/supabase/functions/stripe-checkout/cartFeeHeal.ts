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
// 2. Write the lines, stopping at the first that errors or matches no row.
// 3. Only then write the totals (which also severs the page link).
//
// Any failed write answers heal_failed, never the 409 "fees were updated" (that
// would be untrue, and every retry would drift again: the loop). Nor does
// checkout carry on to Stripe with the server price: a page paid over unhealed
// lines would be rejected by the same guard. Lines and totals are separate
// PostgREST writes, not one transaction; with the prior page retired no paid
// session can be judged against a half-written cart, and the next checkout's
// linkCartCheckout rewrites the totals.

import type { PriorSessionRelease } from '../_shared/cartClassGate.ts';

export interface FeeHealWriteResult {
  error: { message: string; code?: string } | null;
  data: readonly unknown[] | null;
}

export interface DriftedLine {
  itemId: string;
  authoritativeCents: number;
}

export interface FeeHealDeps {
  releasePriorSession: () => Promise<PriorSessionRelease>;
  /** Must select the updated rows, so a write that matched none is caught. */
  writeLineFee: (itemId: string, cents: number) => PromiseLike<FeeHealWriteResult>;
  writeCartTotals: () => PromiseLike<FeeHealWriteResult>;
  logError: (message: string, error: unknown) => void;
}

export type FeeHealOutcome =
  | { kind: 'healed' }
  | { kind: 'heal_failed' }
  | { kind: 'blocked'; status: 409 | 503; error: string };

export const FEES_HEALED_MESSAGE =
  'Entry fees were updated to current show pricing — review your entry and try again.';
export const FEES_HEAL_FAILED_MESSAGE = 'Could not confirm the entry fees. Please try again.';

function writeFailure(result: FeeHealWriteResult): unknown {
  if (result.error) return result.error;
  if (!result.data || result.data.length === 0) return 'no row updated';
  return null;
}

export async function healDriftedCart(
  cartId: string,
  lines: DriftedLine[],
  deps: FeeHealDeps
): Promise<FeeHealOutcome> {
  const release = await deps.releasePriorSession();
  if (release.kind === 'blocked') {
    deps.logError(`Cart ${cartId}: fee heal not started:`, release.diagnostic);
    return { kind: 'blocked', status: release.status, error: release.error };
  }
  for (const { itemId, authoritativeCents } of lines) {
    const failure = writeFailure(await deps.writeLineFee(itemId, authoritativeCents));
    if (failure) {
      deps.logError(`Cart ${cartId}: could not heal the fee on line ${itemId}:`, failure);
      return { kind: 'heal_failed' };
    }
  }
  const totalsFailure = writeFailure(await deps.writeCartTotals());
  if (totalsFailure) {
    deps.logError(`Cart ${cartId}: could not write healed totals:`, totalsFailure);
    return { kind: 'heal_failed' };
  }
  return { kind: 'healed' };
}
