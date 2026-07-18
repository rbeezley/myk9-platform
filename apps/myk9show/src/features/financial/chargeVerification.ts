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
  'entrySubtotalCents' | 'platformFeeCents' | 'amountCents'
>;

/**
 * Verify one online order snapshot: its entry subtotal plus platform fee must tie
 * to the charged amount (within a 1-cent rounding tolerance). A missing snapshot
 * (null subtotal or fee) is a Mismatch, not a silent pass.
 */
export function resolveOrderChargeVerification(
  order: OrderChargeFacts,
  toleranceCents = 1
): 'Verified' | 'Mismatch' {
  const { entrySubtotalCents, platformFeeCents, amountCents } = order;
  if (entrySubtotalCents == null || platformFeeCents == null) return 'Mismatch';
  const expected = entrySubtotalCents + platformFeeCents;
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
