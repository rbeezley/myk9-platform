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
    const key = entry.registrationId || '__unregistered__';

    if (!map.has(key)) {
      const hasEnrollmentTotal = entry.enrollmentTotalAmount != null;
      map.set(key, {
        enrollmentId: entry.registrationId || null,
        confirmationNumber: entry.confirmationNumber ?? null,
        handlerName: entry.handlerName,
        paymentStatus: entry.enrollmentPaymentStatus ?? entry.paymentStatus,
        totalAmount: hasEnrollmentTotal ? entry.enrollmentTotalAmount! : 0,
        totalAmountUnit: hasEnrollmentTotal ? 'cents' : 'dollars',
        paidAmount: entry.enrollmentPaidAmount ?? 0,
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
      group.totalAmount += entry.totalFee;
    }
  }

  return [...map.values()];
}
