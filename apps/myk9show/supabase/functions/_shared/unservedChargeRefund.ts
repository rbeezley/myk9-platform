// What a charge that served NONE of its lines is owed (MYK9-966): a paid but
// abandoned cart (MYK9-874), or a paid payment-link session with no link row.
// Deno-free so the colocated vitest drives it.
//
// OWNER RULE (2026-10-03): the platform keeps its service fee even when nothing
// was delivered, so the refund is the lines' entry fees, never the whole charge.
//
// For an abandoned cart the cart lines are the charge's lines: any cart
// mutation nulls the cart's stripe_checkout_session_id, and the claim only
// runs while it still equals the paid session's id.

import { entryFeeRefundCents, type PlatformFeeRates } from './platformFee.ts';

export interface UnservedChargeRefundInput {
  items: Array<{ entry_fee_cents: number | null | undefined }>;
  /** What Stripe actually collected. */
  amountTotalCents: number | null;
  /** The rates the session was PRICED with (the stamped rates). */
  rates: PlatformFeeRates;
}

/**
 * The entry fees to refund, or null when they cannot be known (no lines, an
 * unpriced line, or no collected amount). Null takes the claim's
 * missing-inputs path, so an operator decides rather than a guessed amount.
 */
export function unservedChargeRefundCents(input: UnservedChargeRefundInput): number | null {
  if (!input.amountTotalCents || input.amountTotalCents <= 0) return null;
  if (input.items.length === 0) return null;
  let subtotalCents = 0;
  for (const item of input.items) {
    const fee = item.entry_fee_cents;
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) return null;
    subtotalCents += Math.round(fee);
  }
  if (subtotalCents <= 0) return null;
  const refund = entryFeeRefundCents({
    unservedEntryFeeCents: subtotalCents,
    fullSubtotalCents: subtotalCents,
    amountTotalCents: input.amountTotalCents,
    rates: input.rates,
  });
  return refund > 0 ? refund : null;
}
