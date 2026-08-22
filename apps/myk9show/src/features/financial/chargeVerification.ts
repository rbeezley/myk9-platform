// Charge-verification state resolver (unified-financial-dashboard, MYK9-54,
// task 2.3). Charge verification is INDEPENDENT of payout settlement: it answers
// "do we hold a Stripe order snapshot for this money movement?", never "did the
// club get paid?" and never "do the amounts look wrong?".
//
// TWO states, both grounded in a recorded fact:
//   - StripeRecord    we hold a Stripe order snapshot for this charge
//   - NoStripeRecord  we hold no Stripe snapshot — a desk payment (check, cash,
//                     waived, secretary/group), or a legacy order that pre-dates
//                     the snapshot contract. Recorded and counted in every
//                     total; we simply hold no Stripe row behind it.
//
// WHY THESE NAMES AND NOT 'Verified' / 'Attested' (MYK9-230). Those came from
// the platform-side dashboard and were carried to the club surface without
// re-checking the audience. 'Verified' reached past its evidence: this module
// tests two columns for non-null and nothing else, while the badge said
// "Verified against Stripe" out loud to a screen reader. On a treasurer-facing
// surface that is expensive — the first real discrepancy found on a row marked
// Verified retires the badge's meaning on every other row too. The names now
// describe the recorded fact, so the resolver and the label make the same
// claim. Renaming was the fix BECAUSE the logic is right: do not "restore" the
// stronger word, and do not reintroduce amount comparison to earn it (below).
//
// WHY THERE IS NO 'Mismatch' STATE ANY MORE. It used to classify an order whose
// amounts did not tie to `entry_subtotal + platform_fee + make_whole` as drift.
// That is an INFERENCE, and it cannot distinguish genuine drift from legitimate
// rounding residue on a proportional split, a legacy row, a partial refund, or a
// cash/check desk refund recorded outside Stripe. Five rounds of review produced
// a false red on each of those in turn, and each targeted fix broke another. On a
// calm-oversight surface a false red is worse than no signal, so the inference is
// gone. Detecting a real amount discrepancy needs a RECORDED signal (e.g. a
// stored Stripe-side reconciliation result), not one derived from local rows.
//
// Pure TypeScript only. Money is integer cents.

export type ChargeVerificationState = 'StripeRecord' | 'NoStripeRecord';

/**
 * Payment labels (from getFinancialPaymentLabel) that represent a Stripe-backed
 * online charge. Everything else — Check, Cash, Waived/Comped, Secretary Paid,
 * Group Payment, Pending — is a desk/manual record with no Stripe trace, and so
 * resolves to NoStripeRecord.
 */
const STRIPE_BACKED_LABELS = new Set(['Online', 'Refunded', 'Partial Refund']);

/** True when a payment label represents a desk/manual (non-Stripe) payment. */
export function isDeskPaymentLabel(paymentLabel: string): boolean {
  return !STRIPE_BACKED_LABELS.has(paymentLabel);
}

/**
 * The only order facts charge verification needs: whether a Stripe snapshot was
 * captured for the order at all.
 */
export interface OrderChargeFacts {
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
}

/**
 * Do we hold a Stripe order snapshot for this order? That is the WHOLE question
 * this answers — not whether the amounts agree, and not whether the club was
 * paid. That is the WHOLE question
 * this answers — not whether the amounts agree, and not whether the club was
 * paid.
 *
 * A snapshot is present when BOTH snapshot columns were captured at charge time
 * (migration 20260717122000). A null column means the order pre-dates the
 * snapshot contract or was recorded outside Stripe — absent, not suspect.
 *
 * This deliberately does NOT compare amounts. See the module header: the tie-out
 * comparison was an inference that produced false reds on rounding residue,
 * legacy rows, partial refunds and desk refunds alike.
 */
export function resolveOrderChargeVerification(order: OrderChargeFacts): ChargeVerificationState {
  if (order.entrySubtotalCents == null || order.platformFeeCents == null) return 'NoStripeRecord';
  return 'StripeRecord';
}

export interface EntryChargeVerificationInput {
  /** Payment label from getFinancialPaymentLabel / EntryAccountingLine.paymentLabel. */
  paymentLabel: string;
  /** The matched Stripe order snapshot for this entry, if one was found. */
  matchedOrder?: OrderChargeFacts | null;
}

/**
 * Resolve the charge-verification state for one accounting line.
 *
 * - Desk/manual payments hold no Stripe trace at all.
 * - A Stripe-backed line with a matched snapshot is StripeRecord.
 * - A Stripe-backed line with no matched snapshot is NoStripeRecord: the
 *   payment is recorded, we simply hold no Stripe snapshot to point at.
 */
export function resolveEntryChargeVerification(
  input: EntryChargeVerificationInput
): ChargeVerificationState {
  if (isDeskPaymentLabel(input.paymentLabel)) return 'NoStripeRecord';
  if (!input.matchedOrder) return 'NoStripeRecord';
  return resolveOrderChargeVerification(input.matchedOrder);
}

/** Aggregate charge-verification counts across a scope. Field names track the
 *  state names deliberately — a `verifiedCount` counting "we hold a snapshot"
 *  is the same overclaim one indirection further from the screen. */
export interface ChargeVerificationSummary {
  stripeRecordCount: number;
  noStripeRecordCount: number;
  /**
   * Orders whose Stripe processing fee is not yet captured, so their NET income is
   * pending (never treated as zero). Surfaced as pending, never as a problem.
   */
  pendingNetCount: number;
  /** Legacy orders with no platform-fee snapshot (rate-unverifiable). */
  snapshotMissingCount: number;
}

export function emptyChargeVerificationSummary(): ChargeVerificationSummary {
  return {
    stripeRecordCount: 0,
    noStripeRecordCount: 0,
    pendingNetCount: 0,
    snapshotMissingCount: 0,
  };
}
