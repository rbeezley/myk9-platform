import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PaymentStatus } from '@/types/show-registration-types';

export interface EnrollmentGroup {
  enrollmentId: string | null;
  confirmationNumber: string | null;
  handlerName: string;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  /**
   * Unit of totalAmount. Stripe amounts are in cents on enrollments.total_amount,
   * but entries.entry_fee (summed as fallback) is in dollars.
   */
  totalAmountUnit: 'cents' | 'dollars';
  /** Amount already recorded as paid, in dollars. */
  paidAmount: number;
  paymentReference: string | null;
  /** Refund amount in dollars (null until a refund is recorded). */
  refundAmount: number | null;
  refundNotes: string | null;
  refundedAt: string | null;
  entries: EntryManagementEntry[];
}

export function groupEntriesByEnrollment(entries: EntryManagementEntry[]): EnrollmentGroup[] {
  const map = new Map<string, EnrollmentGroup>();

  for (const entry of entries) {
    // Online (webhook-created) entries have no registrationId — group them by
    // Stripe ORDER (payment intent) so unrelated exhibitors never collapse
    // into one card with mixed handlers/totals/refund status (Codex P1,
    // PR #625). Entries with neither key stand alone rather than falsely merge.
    const key =
      entry.registrationId ||
      (entry.stripePaymentIntentId ? `pi:${entry.stripePaymentIntentId}` : `entry:${entry.id}`);

    if (!map.has(key)) {
      const hasEnrollmentTotal = entry.enrollmentTotalAmount != null;
      map.set(key, {
        enrollmentId: entry.registrationId || null,
        confirmationNumber: entry.confirmationNumber ?? null,
        handlerName: entry.handlerName,
        paymentStatus: entry.enrollmentPaymentStatus ?? entry.paymentStatus,
        totalAmount: hasEnrollmentTotal ? entry.enrollmentTotalAmount! : 0,
        totalAmountUnit: hasEnrollmentTotal ? 'cents' : 'dollars',
        // Dollar-unit groups start at 0 and accumulate per-entry below;
        // mixing the enrollment figure in would double-count.
        paidAmount: hasEnrollmentTotal ? (entry.enrollmentPaidAmount ?? 0) : 0,
        paymentReference: entry.enrollmentPaymentReference ?? null,
        refundAmount: entry.enrollmentRefundAmount ?? null,
        refundNotes: entry.enrollmentRefundNotes ?? null,
        refundedAt: entry.enrollmentRefundedAt ?? null,
        entries: [],
      });
    }

    const group = map.get(key)!;
    group.entries.push(entry);

    if (group.totalAmountUnit === 'dollars') {
      // No enrollment record (online/pi-grouped or standalone entries): both
      // figures come from the entries themselves. With an enrollment, its
      // total/paid stay authoritative and are never accumulated.
      group.totalAmount += entry.totalFee;
      group.paidAmount += entry.paidAmount;
    }
  }

  // Entry-level Stripe refunds (online checkout has no enrollment record):
  // aggregate them up to the group so one refunded entry of several reads
  // "Partial Refund", not the first entry's status masquerading as the group's.
  // Enrollment-level fields, when present, stay authoritative.
  for (const group of map.values()) {
    const hasEnrollmentStatus = group.entries.some(e => e.enrollmentPaymentStatus != null);
    const refunded = group.entries.filter(e => e.paymentStatus === PaymentStatus.REFUNDED);

    if (!hasEnrollmentStatus && refunded.length > 0) {
      group.paymentStatus =
        refunded.length === group.entries.length
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIAL_REFUND;
    }

    if (group.refundAmount == null) {
      const entryRefundTotal = group.entries.reduce((sum, e) => sum + (e.refundAmount ?? 0), 0);
      if (entryRefundTotal > 0) {
        group.refundAmount = entryRefundTotal;
        group.refundedAt =
          group.entries
            .map(e => e.refundedAt)
            .filter((t): t is string => t != null)
            .sort()
            .at(-1) ?? null;
      }
    }
  }

  return [...map.values()];
}
