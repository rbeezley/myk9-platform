import { PaymentStatus } from '@/types/show-registration-types';

/**
 * The one rule for combining an entry's own `payment_status` with the
 * `payment_status` of the enrollment (order) it hangs off.
 *
 * WHY THIS EXISTS (MYK9-495). Consumers independently wrote
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
 * The two statuses are NOT symmetric, and treating them as such is its own
 * defect: an order goes `pending` as soon as ANY entry under it is unpaid, so a
 * plain "pending on either side wins" re-opens a waived or refunded entry for a
 * SIBLING's debt. The precedence below is therefore an explicit ordered list.
 *
 * Note on vocabulary: `isSettlingPaymentStatus` in
 * `@/features/payments/moneyPresentation` is NOT the predicate for this — it
 * describes `stripe_orders.status` (`pending` / `processing`), a different
 * column with a different CHECK constraint. The settled-terminal set below is
 * derived from the `PaymentStatus` enum itself.
 */

/**
 * Entry-level statuses that mean this entry's money question is CLOSED, however
 * it closed: the fee was forgiven, or money came back. Every one of them is a
 * per-entry decision (`compEntry` writes `waived`; a refund writes `refunded` /
 * `partial_refund`), which is why the order cannot reopen them.
 *
 * Every `PaymentStatus` member is accounted for: PENDING is the unpaid case
 * handled by branch 4, and the three PAID_* members are the ambiguous case that
 * falls through to branch 5 — an order's `pending` legitimately overrides them,
 * because that is the "the entry row says paid but the order has not settled"
 * signal the secretary attention list is built on.
 */
const ENTRY_SETTLED_TERMINAL: ReadonlySet<PaymentStatus> = new Set([
  PaymentStatus.WAIVED,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIAL_REFUND,
]);

/**
 * WHAT happened to the money, ignoring how precisely it was recorded. Two
 * statuses in the same disposition are two spellings of one outcome (`refunded`
 * vs `partial_refund`; `paid` vs `paid_by_check`); two in different
 * dispositions are a genuine disagreement about what happened.
 */
type MoneyDisposition = 'unpaid' | 'paid' | 'refunded' | 'waived';

function dispositionOf(status: PaymentStatus): MoneyDisposition {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return 'paid';
    case PaymentStatus.REFUNDED:
    case PaymentStatus.PARTIAL_REFUND:
      return 'refunded';
    case PaymentStatus.WAIVED:
      return 'waived';
    case PaymentStatus.PENDING:
    default:
      return 'unpaid';
  }
}

export function resolveEffectivePaymentStatus(
  entryPaymentStatus: PaymentStatus | null | undefined,
  enrollmentPaymentStatus: PaymentStatus | null | undefined
): PaymentStatus | null {
  // 1. The entry has no status of its own — the order fills in.
  if (entryPaymentStatus == null) return enrollmentPaymentStatus ?? null;

  // 2. No order to consult; the entry row is all there is.
  if (enrollmentPaymentStatus == null) return entryPaymentStatus;

  // 3. This entry's own money question is CLOSED, and the order disagrees about
  //    what happened to it. An entry-level waive or refund is a per-entry
  //    decision the order never made — the order is `pending` because a SIBLING
  //    entry owes, or `paid` because the sibling paid — so the entry stands.
  if (
    ENTRY_SETTLED_TERMINAL.has(entryPaymentStatus) &&
    dispositionOf(entryPaymentStatus) !== dispositionOf(enrollmentPaymentStatus)
  ) {
    return entryPaymentStatus;
  }

  // 4. Either side saying "unpaid" now survives, because branch 3 has already
  //    taken every settled entry out of the contest.
  //
  //    entry `pending` + order `paid` is the MYK9-495 defect: the order is one
  //    row per (show, handler) reused by every later submission, so its `paid`
  //    cannot vouch for this entry. order `pending` + entry `paid` is the
  //    opposite direction the secretary attention list is built on.
  if (
    entryPaymentStatus === PaymentStatus.PENDING ||
    enrollmentPaymentStatus === PaymentStatus.PENDING
  ) {
    return PaymentStatus.PENDING;
  }

  // 5. Both sides agree on what happened. The ORDER carries the finer value —
  //    the payment METHOD (`paid_by_check`, where an entry row can only persist
  //    the coarse `paid`) and the partial-vs-full refund distinction that
  //    `mapEnrollmentPaymentStatusToEntryStatus` collapses on the way down — so
  //    it wins, exactly as it did before MYK9-495.
  return enrollmentPaymentStatus;
}
