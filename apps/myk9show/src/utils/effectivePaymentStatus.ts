import { PaymentStatus } from '@/types/show-registration-types';

/**
 * The one rule for combining an entry's own `payment_status` with the
 * `payment_status` of the enrollment (order) it hangs off.
 *
 * WHY THIS EXISTS (MYK9-495). Three consumers independently wrote
 * `enrollment ?? entry`, letting the ORDER win unconditionally — including
 * over an entry that was still `pending`. That is wrong, because `enrollments`
 * is uniquely keyed on (show_id, handler_id): there is exactly ONE row per
 * exhibitor per show and every later submission reuses it
 * (`createShowRegistration` returns the existing row rather than inserting a
 * second one). So a `paid` enrollment means "some order for this show was
 * paid" — never "this entry was paid". An entry added after an earlier paid
 * order inherited that `paid`, and $30 of live, payable debt read
 * "Paid in full" on every exhibitor money surface while the cart still offered
 * to charge it.
 *
 * THE RULE: unpaid is sticky. `PENDING` on either side survives, so an entry's
 * own `pending` is authoritative over its order (the MYK9-495 defect) and an
 * order's `pending` still raises an entry row that reads paid (the direction
 * the secretary attention list has always relied on). A partially paid order
 * therefore reports its unpaid remainder rather than nothing.
 *
 * Everything else keeps the prior order-first precedence, deliberately: once
 * neither side says "unpaid" they are describing the same settled outcome, and
 * the ORDER carries the finer value — the payment METHOD (`paid_by_check`
 * where an entry row can only persist the coarse `paid`) and the
 * partial-vs-full refund distinction that
 * `mapEnrollmentPaymentStatusToEntryStatus` collapses on the way down. Paid,
 * waived and refund semantics are unchanged by this module.
 *
 * Money math that must respect an ENTRY-level refund reads the entry row
 * directly first (`hasEntryLevelRefund` in `./entryManagementUtils`) and never
 * relies on this resolver to surface it.
 */
export function resolveEffectivePaymentStatus(
  entryPaymentStatus: PaymentStatus | null | undefined,
  enrollmentPaymentStatus: PaymentStatus | null | undefined
): PaymentStatus | null {
  if (entryPaymentStatus == null) return enrollmentPaymentStatus ?? null;
  if (enrollmentPaymentStatus == null) return entryPaymentStatus;

  if (
    entryPaymentStatus === PaymentStatus.PENDING ||
    enrollmentPaymentStatus === PaymentStatus.PENDING
  ) {
    return PaymentStatus.PENDING;
  }

  return enrollmentPaymentStatus;
}
