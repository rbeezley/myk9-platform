// Pure guard shared by stripe-webhook (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.
//
// Codex round-3 P1: a Stripe Checkout session stays payable after the exhibitor
// abandons the tab. If they then mutate the cart and pay the OLD page, the
// webhook would build entries from the CURRENT cart against the STALE charge.
// Defense is two-sided: cart mutations null out stripe_checkout_session_id
// (cartStore), and the webhook refuses any paid session the cart no longer
// points at. The amount check is belt-and-suspenders — the pinned 2020-03-02
// webhook payloads usually omit amount_total, so the id equality (made
// reliable by the mutation-nulling) is the load-bearing half.

export interface SessionCartGuardInput {
  /** id of the checkout session Stripe says was paid */
  sessionId: string;
  /** session.amount_total — null/undefined on 2020-03-02 payloads */
  sessionAmountTotal: number | null | undefined;
  /** entry_carts.stripe_checkout_session_id at webhook time */
  cartSessionId: string | null;
  /** entry_carts.total_cents at webhook time */
  cartTotalCents: number | null;
  /** number of items on the cart at webhook time */
  cartItemCount: number;
}

export type SessionCartGuardResult = { ok: true } | { ok: false; reason: string };

export function sessionMatchesCart(input: SessionCartGuardInput): SessionCartGuardResult {
  // An empty cart can never legitimately be paid for — "Clear Cart" after
  // starting checkout would otherwise produce a real charge with zero entries
  // (Codex round-4 P1). Checked first: id/amount equality is meaningless here.
  if (input.cartItemCount === 0) {
    return {
      ok: false,
      reason: `cart is empty — session ${input.sessionId} paid for items that were since removed`,
    };
  }
  if (input.cartSessionId !== input.sessionId) {
    return {
      ok: false,
      reason:
        `paid session ${input.sessionId} is not the cart's current session ` +
        `(${input.cartSessionId ?? 'none'}) — the cart changed after this checkout started`,
    };
  }
  if (
    input.sessionAmountTotal != null &&
    input.cartTotalCents != null &&
    input.sessionAmountTotal !== input.cartTotalCents
  ) {
    return {
      ok: false,
      reason:
        `paid amount ${input.sessionAmountTotal}¢ does not match the cart total ` +
        `${input.cartTotalCents}¢ for session ${input.sessionId}`,
    };
  }
  return { ok: true };
}
