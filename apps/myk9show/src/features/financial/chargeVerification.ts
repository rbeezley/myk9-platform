// Charge-verification state resolver (unified-financial-dashboard, MYK9-54,
// task 2.3). Charge verification is INDEPENDENT of payout settlement: it answers
// "does this money movement tie to a Stripe order snapshot?", never "did the club
// get paid?".
//
// Three states (design decision 4):
//   - Verified  an online charge whose amounts tie to a valid order snapshot
//   - Attested  a desk payment (check, cash, waived, secretary/group) with no
//               Stripe trace — it stays in accounting totals and is NEVER a mismatch
//   - Mismatch  an online charge with no snapshot, a missing snapshot, or amounts
//               that do not tie
//
// Pure TypeScript only. Money is integer cents.
import type { FinancialReconciliationOrder } from './financialReconciliation';

export type ChargeVerificationState = 'Verified' | 'Attested' | 'Mismatch';

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

type OrderChargeFacts = Pick<
  FinancialReconciliationOrder,
  'entrySubtotalCents' | 'platformFeeCents' | 'amountCents' | 'makeWholeRefundedCents'
>;

/**
 * Verify one online order snapshot against the refund-attribution invariant
 * (migration 20260717120000):
 *
 *   amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents
 *
 * WHY make-whole BELONGS IN THE TIE-OUT. `amountCents` is the GROSS charge,
 * covering cart lines that may never have been accepted; `entrySubtotalCents` and
 * the `platformFeeCents` computed on it cover only the ACCEPTED lines. The
 * difference is exactly the cart-overflow make-whole refund. Requiring
 * `amount == subtotal + fee` therefore marked EVERY legitimate overflow order a
 * Mismatch — a false positive on a perfectly reconciled charge.
 *
 * WHY THIS IS NOT TAUTOLOGICAL. `makeWholeRefundedCents` is recorded EXPLICITLY at
 * write time by the refund path, not derived from `amount − subtotal − fee`. So an
 * order whose gross does not equal its parts still FAILS: the check remains
 * falsifiable, which is the entire point of the explicit split.
 *
 * A missing snapshot (null subtotal or fee) is a Mismatch, not a silent pass.
 */
export function resolveOrderChargeVerification(
  order: OrderChargeFacts,
  toleranceCents = 1
): 'Verified' | 'Mismatch' {
  const { entrySubtotalCents, platformFeeCents, amountCents, makeWholeRefundedCents } = order;
  if (entrySubtotalCents == null || platformFeeCents == null) return 'Mismatch';
  const expected = entrySubtotalCents + platformFeeCents + (makeWholeRefundedCents ?? 0);
  return Math.abs(expected - amountCents) <= toleranceCents ? 'Verified' : 'Mismatch';
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
 * - A Stripe-backed line with a matched snapshot is verified against its amounts.
 * - A Stripe-backed line with no matched snapshot is a Mismatch.
 */
export function resolveEntryChargeVerification(
  input: EntryChargeVerificationInput
): ChargeVerificationState {
  if (isDeskAttestedLabel(input.paymentLabel)) return 'Attested';
  if (!input.matchedOrder) return 'Mismatch';
  return resolveOrderChargeVerification(input.matchedOrder);
}

/** Aggregate charge-verification counts across a scope. */
export interface ChargeVerificationSummary {
  verifiedCount: number;
  attestedCount: number;
  mismatchCount: number;
  /**
   * Orders whose Stripe processing fee is not yet captured, so their NET income is
   * pending (never treated as zero). Surfaced as pending, distinct from a mismatch.
   */
  pendingNetCount: number;
  /** Legacy orders with no platform-fee snapshot (rate-unverifiable). */
  snapshotMissingCount: number;
}

export function emptyChargeVerificationSummary(): ChargeVerificationSummary {
  return {
    verifiedCount: 0,
    attestedCount: 0,
    mismatchCount: 0,
    pendingNetCount: 0,
    snapshotMissingCount: 0,
  };
}
