/**
 * Enrollment payment-column builders for the STAFF write path.
 *
 * Extracted from `reads.ts` to keep that file under the 500-line ceiling when
 * MYK9-486 added the self-service branch. Behaviour is unchanged; the
 * exhibitor path uses `selfServiceEnrollmentFields.ts` instead.
 */

import {
  PaymentStatus,
  type PaymentDetails,
  type PaymentMethod,
} from '@/types/show-registration-types';
import type { Registration } from '@/types/registration-types';
import type { TablesUpdate } from '@/types/supabase';

export function paymentMethodToEnrollmentStatus(
  paymentMethod: PaymentMethod | undefined
): string | undefined {
  switch (paymentMethod) {
    case 'check':
    case 'cash':
      return PaymentStatus.PENDING;
    case 'secretary_paid':
    case 'group_payment':
      return 'paid';
    case 'waived':
      return PaymentStatus.WAIVED;
    case 'credit_card':
      return PaymentStatus.PENDING;
    default:
      return undefined;
  }
}

function isEnrollmentPaidAtSubmit(paymentStatus: string | undefined): boolean {
  return (
    paymentStatus === 'paid' ||
    paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    paymentStatus === PaymentStatus.PAID_BY_CASH
  );
}

export function buildEnrollmentPaymentFields({
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
  existingTotalAmountCents = 0,
  existingPaidAmountDollars = 0,
  includeEmptyPaymentDetails = false,
  preservePaidAmountForPending = false,
  preserveFinancialForWaived = false,
}: {
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
  existingTotalAmountCents?: number | null | undefined;
  existingPaidAmountDollars?: number | null | undefined;
  includeEmptyPaymentDetails?: boolean | undefined;
  preservePaidAmountForPending?: boolean | undefined;
  preserveFinancialForWaived?: boolean | undefined;
}): TablesUpdate<'enrollments'> {
  const paymentStatus = paymentMethodToEnrollmentStatus(paymentMethod);
  const shouldPreserveFinancialForWaived = preserveFinancialForWaived && paymentStatus === 'waived';
  const nextTotalAmountCents =
    totalAmountCents !== undefined && !shouldPreserveFinancialForWaived
      ? (existingTotalAmountCents ?? 0) + totalAmountCents
      : undefined;
  const isRecordedPaid = isEnrollmentPaidAtSubmit(paymentStatus);
  const paidAmount = isRecordedPaid
    ? (existingPaidAmountDollars ?? 0) + (totalAmountCents ?? 0) / 100
    : 0;
  const nextTotalAmountDollars =
    nextTotalAmountCents !== undefined ? nextTotalAmountCents / 100 : undefined;
  const resolvedPaymentStatus =
    isRecordedPaid && nextTotalAmountDollars !== undefined && paidAmount < nextTotalAmountDollars
      ? PaymentStatus.PENDING
      : paymentStatus;
  const shouldPreservePaidAmount =
    preservePaidAmountForPending && paymentStatus === PaymentStatus.PENDING;

  const fields: TablesUpdate<'enrollments'> = {
    ...(resolvedPaymentStatus && !shouldPreserveFinancialForWaived
      ? {
          payment_status: resolvedPaymentStatus,
          ...(!shouldPreservePaidAmount ? { paid_amount: paidAmount } : {}),
        }
      : {}),
    ...(paymentMethod && !shouldPreserveFinancialForWaived
      ? { payment_method: paymentMethod }
      : {}),
    ...(nextTotalAmountCents !== undefined ? { total_amount: nextTotalAmountCents } : {}),
  };

  if (includeEmptyPaymentDetails || paymentReference !== undefined) {
    fields.payment_reference = paymentReference ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.checkNumber !== undefined) {
    fields.check_number = paymentDetails?.checkNumber ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.paymentDate !== undefined) {
    fields.payment_date = paymentDetails?.paymentDate ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.groupReference !== undefined) {
    fields.group_reference = paymentDetails?.groupReference ?? null;
  }
  if (includeEmptyPaymentDetails || paymentDetails?.paymentNotes !== undefined) {
    fields.payment_notes = paymentDetails?.paymentNotes ?? null;
  }

  return fields;
}

export function hasEnrollmentPaymentInput({
  paymentReference,
  paymentDetails,
  paymentMethod,
  totalAmountCents,
}: {
  paymentReference?: string | undefined;
  paymentDetails?: PaymentDetails | undefined;
  paymentMethod?: PaymentMethod | undefined;
  totalAmountCents?: number | undefined;
}): boolean {
  return Boolean(
    paymentReference || paymentDetails || paymentMethod || totalAmountCents !== undefined
  );
}

export function shouldPreserveFinancialForWaived(
  existing: Registration,
  paymentMethod?: PaymentMethod
) {
  if (paymentMethod !== 'waived') return false;
  return (
    existing.paymentStatus !== PaymentStatus.PENDING ||
    (existing.totalAmount ?? 0) > 0 ||
    (existing.paidAmount ?? 0) > 0
  );
}
