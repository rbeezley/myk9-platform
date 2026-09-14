/**
 * The enrollment columns an EXHIBITOR is allowed to write when they submit
 * their own entries (MYK9-486).
 *
 * `trg_restrict_payment_status` (BEFORE UPDATE on `public.enrollments`) raises
 * `payment_status can only be modified by the service role, a platform admin,
 * or a secretary` whenever an unprivileged caller changes that column. The
 * self-service submit path used to send `payment_status: 'pending'` on every
 * submit; that is a no-op on a fresh enrollment and a hard failure on any
 * enrollment whose status has already moved on — which is every add-on entry
 * onto an enrollment a secretary marked paid.
 *
 * An exhibitor may declare a METHOD ("I will pay by check at the show"); only
 * staff may declare a STATUS. The per-entry record of that intent is written
 * server-side by the `submit_show_entries` SECURITY DEFINER RPC, which pins
 * `entries.payment_status` to 'pending' for check/cash and stores the method.
 *
 * So this builder emits, at most:
 *  - `payment_method`, and only while the enrollment is still unpaid — relabelling
 *    a card-paid enrollment as "check" would misreport how money arrived.
 *  - `total_amount`, accumulated, which no trigger guards.
 *
 * Never `payment_status`, never `paid_amount` (guarded by
 * `trg_restrict_enrollment_money_columns`), and never a blanket null-out of the
 * payment-detail columns a secretary may already have filled in.
 */

import { PaymentStatus, type PaymentMethod } from '@/types/show-registration-types';
import type { TablesUpdate } from '@/types/supabase';

export interface SelfServiceEnrollmentPaymentInput {
  /** Current status of the enrollment row; omit for a row being inserted. */
  existingPaymentStatus?: string | undefined;
  existingTotalAmountCents?: number | null | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
}

export function buildSelfServiceEnrollmentPaymentFields({
  existingPaymentStatus,
  existingTotalAmountCents,
  paymentMethod,
  totalAmountCents,
}: SelfServiceEnrollmentPaymentInput): TablesUpdate<'enrollments'> {
  const fields: TablesUpdate<'enrollments'> = {};

  const enrollmentIsUnpaid =
    existingPaymentStatus === undefined || existingPaymentStatus === PaymentStatus.PENDING;
  if (paymentMethod && enrollmentIsUnpaid) {
    fields.payment_method = paymentMethod;
  }

  if (totalAmountCents !== undefined) {
    fields.total_amount = (existingTotalAmountCents ?? 0) + totalAmountCents;
  }

  return fields;
}
