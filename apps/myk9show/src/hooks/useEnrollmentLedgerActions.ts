import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { currentCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import { recordEnrollmentPayment } from '@/services/database/show-payments';
import { logger } from '@/services/LoggingService';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { PaymentStatus } from '@/types/show-registration-types';
import { getEntryPaidAmount, hasEntryLevelRefund } from '@/utils/entryManagementUtils';
import { mapEnrollmentStatusToEntryPaymentStatus } from './useEntryManagementActions';

function toNumberOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The enrollment's rows as `record_enrollment_payment` left them. Mirrors the
 * optimistic patch in `handleEnrollmentPaymentChange`, but from the server's
 * answer: the RPC decides the status (a partial that covers the balance is
 * paid) and the running paid total, so the client never guesses either.
 */
export function applyRecordedEnrollmentPayment(
  entry: EntryManagementEntry,
  recorded: RecordedEnrollmentPayment
): EntryManagementEntry {
  const status = recorded.payment_status as PaymentStatus;
  const paymentStatus = hasEntryLevelRefund(entry)
    ? entry.paymentStatus
    : mapEnrollmentStatusToEntryPaymentStatus(status);
  return {
    ...entry,
    enrollmentPaymentStatus: status,
    paymentStatus,
    paidAmount: getEntryPaidAmount({ ...entry, paymentStatus, enrollmentPaymentStatus: status }),
    enrollmentPaymentReference: recorded.payment_reference,
    enrollmentPaidAmount: toNumberOrNull(recorded.paid_amount),
    enrollmentRefundAmount: toNumberOrNull(recorded.refund_amount),
    enrollmentRefundNotes: recorded.refund_notes,
    enrollmentRefundedAt: recorded.refunded_at,
  };
}

export interface EnrollmentLedgerControls {
  /** Records one cash/check payment, refund or "Payment Due" reset. */
  record: (enrollmentId: string, action: EnrollmentLedgerAction) => Promise<boolean>;
  /** Today on the show's calendar: what a received-date input starts at. */
  todayInShowZone: string;
}

/**
 * MYK9-677: Entry Management's money actions that go through the payments
 * ledger. Online ("Paid in Full: Online") stays on `handleEnrollmentPaymentChange`,
 * since online money is not the desk's.
 *
 * Not optimistic: the server computes the new status and paid total, and a
 * refused payment (wrong show, future date) must not flash as recorded.
 */
export function useEnrollmentLedgerActions({
  setEntries,
  showTimeZone,
}: {
  setEntries: React.Dispatch<React.SetStateAction<EntryManagementEntry[]>>;
  showTimeZone: string;
}): EnrollmentLedgerControls {
  const queryClient = useQueryClient();
  const todayInShowZone = currentCalendarDate(new Date(), showTimeZone);

  const record = useCallback(
    async (enrollmentId: string, action: EnrollmentLedgerAction) => {
      try {
        const recorded = await recordEnrollmentPayment(enrollmentId, action);
        setEntries(prev =>
          prev.map(entry =>
            entry.registrationId === enrollmentId
              ? applyRecordedEnrollmentPayment(entry, recorded)
              : entry
          )
        );
        void queryClient.invalidateQueries({ queryKey: ['show-payments'] });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Payment not recorded: ${message}`);
        logger.error('Error recording enrollment payment:', 'secretary', {}, err as Error);
        return false;
      }
    },
    [queryClient, setEntries]
  );

  return useMemo(() => ({ record, todayInShowZone }), [record, todayInShowZone]);
}
