import { withResolvedMoneyRoots } from './moneyRoot';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/**
 * Entry Management's rows, with each run's money read from wherever it is
 * recorded (MYK9-639).
 *
 * A move-up destination is created money-neutral — `payment_status = 'pending'`,
 * `entry_fee = 0`, no method, no Stripe intent — and points at the entry the
 * exhibitor actually paid for. Resolving that ONCE here, at the mapper, is what
 * lets every downstream reader stay ignorant of move-ups:
 *
 *  - `classifyEntryAttention` stops calling a paid dog "Payment due";
 *  - `isPaymentRequestable` stops offering "Request payment" on a settled entry;
 *  - `isStripeRefundable` offers the refund the exhibitor is owed, and
 *    `moneyRootEntryId` says which row it must be issued against;
 *  - the totals, the enrollment card and the stat chips agree with each other.
 *
 * The row keeps everything that makes it THIS run — id, dog, class, armband,
 * lifecycle status, check-in, scoring. Only the money columns come from the
 * root, and only when the root is a different row.
 *
 * The superseded source is deliberately NOT removed here: Entry Management
 * renders it read-only so a secretary can see where the run came from, and the
 * aggregations exclude it by status.
 */
export function withEntryManagementMoneyRoots(
  entries: readonly EntryManagementEntry[]
): EntryManagementEntry[] {
  return withResolvedMoneyRoots(entries, (entry, root) => ({
    ...entry,
    totalFee: root.totalFee,
    paidAmount: root.paidAmount,
    paymentStatus: root.paymentStatus,
    ...(root.rawPaymentStatus !== undefined ? { rawPaymentStatus: root.rawPaymentStatus } : {}),
    ...(root.paymentMethod !== undefined ? { paymentMethod: root.paymentMethod } : {}),
    ...(root.stripePaymentIntentId !== undefined
      ? { stripePaymentIntentId: root.stripePaymentIntentId }
      : {}),
    ...(root.comped !== undefined ? { comped: root.comped } : {}),
    ...(root.compedReason !== undefined ? { compedReason: root.compedReason } : {}),
    ...(root.refundAmount !== undefined ? { refundAmount: root.refundAmount } : {}),
    ...(root.refundedAt !== undefined ? { refundedAt: root.refundedAt } : {}),
    ...(root.refundDecision !== undefined ? { refundDecision: root.refundDecision } : {}),
    // The enrollment/order facts belong to the root too: it is the row the
    // exhibitor's registration created and paid for, so this is also what puts
    // the destination back on the right order card.
    ...(root.enrollmentPaymentStatus !== undefined
      ? { enrollmentPaymentStatus: root.enrollmentPaymentStatus }
      : {}),
    ...(root.enrollmentPaymentReference !== undefined
      ? { enrollmentPaymentReference: root.enrollmentPaymentReference }
      : {}),
    ...(root.enrollmentTotalAmount !== undefined
      ? { enrollmentTotalAmount: root.enrollmentTotalAmount }
      : {}),
    ...(root.enrollmentPaidAmount !== undefined
      ? { enrollmentPaidAmount: root.enrollmentPaidAmount }
      : {}),
    ...(root.enrollmentRefundAmount !== undefined
      ? { enrollmentRefundAmount: root.enrollmentRefundAmount }
      : {}),
    ...(root.enrollmentRefundNotes !== undefined
      ? { enrollmentRefundNotes: root.enrollmentRefundNotes }
      : {}),
    ...(root.enrollmentRefundedAt !== undefined
      ? { enrollmentRefundedAt: root.enrollmentRefundedAt }
      : {}),
  }));
}
