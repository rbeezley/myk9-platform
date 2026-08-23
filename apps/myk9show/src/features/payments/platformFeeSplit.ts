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
 * ── THE CLAMP IS NOT DEAD CODE, AND IT IS NOT ABOUT ORDER SIZE ────────────
 * The estimate is ~2.9% of the cart; the fee is `percent`% of it plus any flat
 * component. Where the estimate reaches the whole fee, the clamped platform
 * share is $0.00 and myK9Show is losing money on the transaction. Clamping
 * silently would print that zero as though the arithmetic worked out that way,
 * so the clamp reports itself through `cardProcessingCoversWholeFee`, and every
 * surface that renders the split must consult it.
 *
 * At 7% / 0¢ / 0¢ it binds only below a ~$7.92 subtotal, which is why "on a
 * small order" reads correctly TODAY — and why that phrasing is a trap. Below
 * ~3%, or on a flat-only fee, it binds at every cart size: at 2% / 0¢ / 0¢ a
 * $500 cart reports a $0.00 platform share too. The copy therefore states the
 * arithmetic, never the size.
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
   * costs myK9Show at least as much to process as the fee collects, and the
   * clamped share is $0.00. EVERY surface that renders the split must consult
   * this and say so — a bare $0.00 reads as a computed fact rather than a clamp.
   *
   * It is NOT a statement about order size. The estimate is ~2.9% of the cart
   * while the fee is `percent`% of it, so at 7% it binds only below ~$7.92 —
   * but at any percent below ~3, or a flat-only fee, it binds at EVERY size.
   * Copy driven by this flag must therefore never say "on an order this small";
   * use CARD_PROCESSING_COVERS_FEE_NOTE, which does not.
   *
   * The comparison is `>=`, not `>`: at 7/0/0 there are subtotals ($7.50–$7.92)
   * where the estimate exactly equals the fee, so the copy says "at least the
   * entire" rather than "more than".
   */
  cardProcessingCoversWholeFee: boolean;
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
      cardProcessingCoversWholeFee: false,
    };
  }
  const estimatedCents = estimateCardProcessingCents(subtotalCents + feeCents);
  const cardProcessingCents = Math.min(estimatedCents, feeCents);
  return {
    feeCents,
    cardProcessingCents,
    platformShareCents: feeCents - cardProcessingCents,
    cardProcessingCoversWholeFee: estimatedCents >= feeCents,
  };
}

/**
 * The one sentence every surface uses when `cardProcessingCoversWholeFee` is
 * set. Lives here so the cart, the club note and /fees cannot drift — and so
 * the claim stays about the ARITHMETIC (processing covers the whole fee)
 * rather than about order size, which the flag does not measure.
 */
export const CARD_PROCESSING_COVERS_FEE_NOTE =
  'Card processing alone is estimated at the entire service fee here, so myK9Show keeps nothing from it.';

/** The same fact as a table footnote, where the marked rows carry the detail. */
export const CARD_PROCESSING_COVERS_FEE_FOOTNOTE =
  'Card processing alone is estimated at the entire service fee on the marked rows, so myK9Show keeps nothing from them.';

/** "2.9% + $0.30" — names the third-party rate the estimate is built from. */
export function formatCardRateLabel(): string {
  return `${STRIPE_CARD_RATE.percent}% + $${(STRIPE_CARD_RATE.flatCents / 100).toFixed(2)}`;
}
