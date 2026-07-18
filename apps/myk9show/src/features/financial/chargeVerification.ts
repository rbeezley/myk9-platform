// Charge-verification state resolver (unified-financial-dashboard, MYK9-54,
// task 2.3). Charge verification is INDEPENDENT of payout settlement: it answers
// "do we hold a Stripe order snapshot for this money movement?", never "did the
// club get paid?" and never "do the amounts look wrong?".
//
// TWO states, both grounded in a recorded fact:
//   - Verified  we hold a Stripe order snapshot for this charge
//   - Attested  we hold no Stripe snapshot — a desk payment (check, cash, waived,
//               secretary/group), or a legacy order that pre-dates the snapshot
//               contract. Recorded, counted in every total, but not Stripe-verified.
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

export type ChargeVerificationState = 'Verified' | 'Attested';

/**
 * Payment labels (from getFinancialPaymentLabel) that represent a Stripe-backed
 * online charge. Everything else — Check, Cash, Waived/Comped, Secretary Paid,
 * Group Payment, Pending — is a desk/manual record with no Stripe trace and is
 * therefore Attested.
 */
const STRIPE_BACKED_LABELS = new Set(['Online', 'Refunded', 'Partial Refund']);

/** True when a payment label represents a desk/manual (non-Stripe) payment. */
export function isDeskAttestedLabel(paymentLabel: string): boolean {
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
 * Do we hold a Stripe order snapshot for this order?
 *
 * A snapshot is present when BOTH snapshot columns were captured at charge time
 * (migration 20260717120000). A null column means the order pre-dates the
 * snapshot contract or was recorded outside Stripe — Attested, not suspect.
 *
 * This deliberately does NOT compare amounts. See the module header: the tie-out
 * comparison was an inference that produced false reds on rounding residue,
 * legacy rows, partial refunds and desk refunds alike.
 */
export function resolveOrderChargeVerification(order: OrderChargeFacts): ChargeVerificationState {
  if (order.entrySubtotalCents == null || order.platformFeeCents == null) return 'Attested';
  return 'Verified';
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
 * - Desk/manual payments are Attested (no Stripe trace to verify against).
 * - A Stripe-backed line with a matched snapshot is Verified.
 * - A Stripe-backed line with no matched snapshot is Attested: the payment is
 *   recorded, we simply hold no Stripe snapshot to back a "Verified" claim.
 */
export function resolveEntryChargeVerification(
  input: EntryChargeVerificationInput
): ChargeVerificationState {
  if (isDeskAttestedLabel(input.paymentLabel)) return 'Attested';
  if (!input.matchedOrder) return 'Attested';
  return resolveOrderChargeVerification(input.matchedOrder);
}

/** Aggregate charge-verification counts across a scope. */
export interface ChargeVerificationSummary {
  verifiedCount: number;
  attestedCount: number;
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
    verifiedCount: 0,
    attestedCount: 0,
    pendingNetCount: 0,
    snapshotMissingCount: 0,
  };
}
