/**
 * Splitting the service fee into card processing and myK9Show's share (MYK9-229).
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The service fee reads as expensive because nothing says that a large part of
 * it is Stripe's card processing, which myK9Show neither sets nor receives.
 * Because Stripe's cost carries a fixed per-transaction component, the split is
 * NOT a constant ratio — it is a bigger share of a small cart than a large one.
 * So it has to be computed per cart; "about half" is wrong at both ends.
 *
 * ── WHAT IS EXACT AND WHAT IS AN ESTIMATE ─────────────────────────────────
 * `feeCents` is EXACT: it comes from `calculatePlatformFeeCents`, the same
 * expression that prices the actual charge. This module deliberately does not
 * restate that expression — a second fee formula is exactly how a disclosure
 * drifts from the charge, which is the failure mode this feature would create.
 *
 * `cardProcessingCents` is an ESTIMATE and must be labelled as one wherever it
 * is shown. Stripe's real fee lands in `stripe_orders.stripe_processing_fee_cents`
 * from the balance transaction and is NULL until the payment settles, so at
 * checkout the exact number does not exist yet. It also varies by card (Amex,
 * international) — which is why the Stripe RECEIPT keeps a single fee line and
 * is never split into these estimated components.
 *
 * ── THE CLAMP IS NOT DEAD CODE ────────────────────────────────────────────
 * Card processing has a fixed component and the fee (at 0¢ flat / 0¢ floor)
 * does not, so below a small subtotal the estimated processing cost EXCEEDS the
 * whole fee — myK9Show loses money on the transaction. Clamping silently would
 * report a $0.00 platform share as though the arithmetic worked out that way,
 * so the clamp reports itself: `cardProcessingExceedsFee` tells the UI to say
 * what actually happened rather than print a coincidental zero.
 */

import {
  calculatePlatformFeeCents,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';

/**
 * Stripe's published US domestic card rate. An assumption about a THIRD PARTY's
 * pricing, not a setting of ours — which is the whole reason the split is
 * labelled approximate. Kept in step with docs/operations/unit-economics.md § 2.
 */
export const STRIPE_CARD_RATE = {
  percent: 2.9,
  flatCents: 30,
} as const;

export interface PlatformFeeSplit {
  /** The fee actually charged. Exact — straight from `calculatePlatformFeeCents`. */
  feeCents: number;
  /** Estimated card processing, never more than the fee itself. */
  cardProcessingCents: number;
  /** The remainder of the fee. Always `feeCents - cardProcessingCents`. */
  platformShareCents: number;
  /**
   * The unclamped estimate is at or above the whole fee, i.e. this transaction
   * costs myK9Show at least as much to process as the fee collects. The UI must
   * say so rather than render the clamped $0.00 share as a fact.
   */
  cardProcessingExceedsFee: boolean;
}

/**
 * Stripe charges its percentage on the WHOLE amount the customer pays — entry
 * fees plus the service fee — because the platform is merchant of record on the
 * full charge and transfers the club's portion separately.
 */
export function estimateCardProcessingCents(amountChargedCents: number): number {
  if (!Number.isFinite(amountChargedCents) || amountChargedCents <= 0) return 0;
  return (
    Math.round((amountChargedCents * STRIPE_CARD_RATE.percent) / 100) +
    STRIPE_CARD_RATE.flatCents
  );
}

/**
 * Split the fee for one cart. The two parts always sum to `feeCents` exactly,
 * so the disclosure can never add up to a different number than the charge.
 */
export function splitPlatformFee(
  subtotalCents: number,
  rates: PlatformFeeRates
): PlatformFeeSplit {
  const feeCents = calculatePlatformFeeCents(subtotalCents, rates);
  if (feeCents <= 0) {
    return {
      feeCents: 0,
      cardProcessingCents: 0,
      platformShareCents: 0,
      cardProcessingExceedsFee: false,
    };
  }
  const estimatedCents = estimateCardProcessingCents(subtotalCents + feeCents);
  const cardProcessingCents = Math.min(estimatedCents, feeCents);
  return {
    feeCents,
    cardProcessingCents,
    platformShareCents: feeCents - cardProcessingCents,
    cardProcessingExceedsFee: estimatedCents >= feeCents,
  };
}

/** "2.9% + $0.30" — names the third-party rate the estimate is built from. */
export function formatCardRateLabel(): string {
  return `${STRIPE_CARD_RATE.percent}% + $${(STRIPE_CARD_RATE.flatCents / 100).toFixed(2)}`;
}
