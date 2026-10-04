import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee.ts';

export interface CartOverflowRefundInput {
  paymentIntentId: string | null;
  sessionAmountTotalCents: number | null;
  paidLineIds: string[];
  noServiceLineIds: string[];
  lineAmountsById: Map<string, number>;
  /**
   * The rates this cart was PRICED with (the stamped rates). They give the
   * unserved lines' share of the service fee, refunded with their entry fees
   * (`cartOverflowRefundAmountCents`).
   */
  platformFeeRates: PlatformFeeRates;
}

export type CartOverflowRefundDecision =
  | { action: 'none'; paidAmountCents: number | null }
  | {
      action: 'refund';
      amountCents: number;
      paidAmountCents: number;
      reason: 'full_make_whole' | 'partial_no_service_lines';
    }
  | { action: 'needs_manual_amount'; missingLineIds: string[]; paidAmountCents: number | null }
  | {
      action: 'cannot_refund';
      reason: 'missing_payment_intent' | 'missing_amount';
      paidAmountCents: number | null;
    };

export function decideCartOverflowRefund(
  input: CartOverflowRefundInput
): CartOverflowRefundDecision {
  if (input.noServiceLineIds.length === 0) {
    return { action: 'none', paidAmountCents: input.sessionAmountTotalCents };
  }

  const paidForLineIds = [...input.paidLineIds, ...input.noServiceLineIds];
  const missingLineIds = paidForLineIds.filter(id => !input.lineAmountsById.has(id));
  if (missingLineIds.length > 0) {
    return { action: 'needs_manual_amount', missingLineIds, paidAmountCents: null };
  }

  if (!input.sessionAmountTotalCents || input.sessionAmountTotalCents <= 0) {
    return {
      action: 'cannot_refund',
      reason: 'missing_amount',
      paidAmountCents: null,
    };
  }

  const paidSubtotalCents = sumLineAmounts(input.lineAmountsById, input.paidLineIds);
  const noServiceSubtotalCents = sumLineAmounts(input.lineAmountsById, input.noServiceLineIds);
  const subtotalCents = paidSubtotalCents + noServiceSubtotalCents;
  if (subtotalCents <= 0 || noServiceSubtotalCents <= 0) {
    return {
      action: 'needs_manual_amount',
      missingLineIds: input.noServiceLineIds,
      paidAmountCents: null,
    };
  }

  const refundAmountCents = cartOverflowRefundAmountCents({
    unservedEntryFeeCents: noServiceSubtotalCents,
    fullSubtotalCents: subtotalCents,
    amountTotalCents: input.sessionAmountTotalCents,
    rates: input.platformFeeRates,
  });
  if (refundAmountCents <= 0) {
    // Nothing was collected: nothing computable is owed, so an operator
    // decides rather than a 0¢ refund being issued.
    return { action: 'needs_manual_amount', missingLineIds: [], paidAmountCents: null };
  }
  const paidAmountCents = Math.max(0, input.sessionAmountTotalCents - refundAmountCents);

  if (!input.paymentIntentId) {
    return {
      action: 'cannot_refund',
      reason: 'missing_payment_intent',
      paidAmountCents,
    };
  }

  return {
    action: 'refund',
    amountCents: refundAmountCents,
    paidAmountCents,
    reason: input.paidLineIds.length === 0 ? 'full_make_whole' : 'partial_no_service_lines',
  };
}

/**
 * THE cart-overflow amount rule, in one place: what the unserved lines of a
 * paid cart are owed back.
 *
 * ── OWNER RULE (2026-10-04, MYK9-964 follow-up) ───────────────────────────
 * A cart line that could not be entered was paid for and got nothing, so it
 * is refunded IN FULL: its entry fee plus its share of the service fee, the
 * same "paid, got nothing" principle as a paid abandoned cart (MYK9-997). It
 * replaces the entry-fees-only rule (MYK9-966) for cart overflow only; a
 * payment link's invalid entries keep `entryFeeRefundCents`.
 *
 * "Its share" is the INCREMENTAL share (the MYK9-197 make-whole formula):
 *
 *   refund = unservedEntryFees + (fee(fullSubtotal) − fee(acceptedSubtotal))
 *
 * i.e. only the part of the fee the unserved lines caused. The flat
 * per-checkout component and the floor are earned once per checkout, so they
 * stay with the served lines; with NO line served, fee(0) = 0 and the refund
 * is the whole charge. Not a proportional split of the total: that spreads
 * the flat fee and the floor onto unserved lines and refunds fee income the
 * platform earned on the served ones (MYK9-197 review B1).
 *
 * The platform keeps fee(acceptedSubtotal); `cartOverflowKeptFeeCents` is
 * that booking, so the order tie-out
 *   amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents
 * balances exactly once the refund is approved.
 *
 * UNDER-COLLECTION: when Stripe collected less than the lines are worth (a
 * coupon, a stale price), the refund scales down with what was collected, and
 * never exceeds it. That order legitimately fails the tie-out.
 */
export function cartOverflowRefundAmountCents(input: {
  unservedEntryFeeCents: number;
  fullSubtotalCents: number;
  amountTotalCents: number;
  rates: PlatformFeeRates;
}): number {
  const unservedCents = Math.max(0, Math.round(input.unservedEntryFeeCents));
  const fullSubtotalCents = Math.max(0, Math.round(input.fullSubtotalCents));
  const amountTotalCents = Math.max(0, Math.round(input.amountTotalCents));
  const acceptedSubtotalCents = Math.max(0, fullSubtotalCents - unservedCents);
  const fullFeeCents = calculatePlatformFeeCents(fullSubtotalCents, input.rates);
  // Non-negative: the fee is monotonic non-decreasing in the subtotal.
  const feeShareCents = Math.max(
    0,
    fullFeeCents - calculatePlatformFeeCents(acceptedSubtotalCents, input.rates)
  );
  const idealCents = unservedCents + feeShareCents;

  const expectedTotalCents = fullSubtotalCents + fullFeeCents;
  const scaledCents =
    expectedTotalCents > 0 && amountTotalCents < expectedTotalCents
      ? Math.round((idealCents * amountTotalCents) / expectedTotalCents)
      : idealCents;
  return Math.min(scaledCents, amountTotalCents);
}

/**
 * The service fee a cart-overflow order KEEPS, and books as its
 * `platform_fee_cents`: the fee on the served lines only, fee(paidSubtotal).
 * The rest of what was charged is refunded with the unserved lines
 * (`cartOverflowRefundAmountCents`). A fully served cart keeps the whole fee;
 * a cart with nothing served keeps nothing.
 */
export function cartOverflowKeptFeeCents(input: {
  paidSubtotalCents: number;
  rates: PlatformFeeRates;
}): number {
  return calculatePlatformFeeCents(input.paidSubtotalCents, input.rates);
}

function sumLineAmounts(lineAmountsById: Map<string, number>, lineIds: string[]): number {
  return lineIds.reduce((sum, id) => sum + (lineAmountsById.get(id) ?? 0), 0);
}
