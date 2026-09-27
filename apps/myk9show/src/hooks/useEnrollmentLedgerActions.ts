import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { currentCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import {
  markEnrollmentPaidOnline,
  recordEnrollmentPayment,
} from '@/services/database/show-payments';
import { logger } from '@/services/LoggingService';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { PaymentStatus } from '@/types/show-registration-types';
import {
  getEntryPaidAmount,
  hasEntryLevelRefund,
  mapPaymentStatus,
} from '@/utils/entryManagementUtils';
import { mapEnrollmentStatusToEntryPaymentStatus } from './useEntryManagementActions';

function toNumberOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The enrollment's rows as `record_enrollment_payment` (or, MYK9-773,
 * `mark_enrollment_paid_online`) left them, from the server's answer: the RPC
 * decides the status (a partial that covers the balance is paid), the running
 * paid total and (MYK9-773) each entry's own status, so the client never
 * guesses any of them. Only a server that predates the per-entry
 * answer falls back to the local rule.
 */
export function applyRecordedEnrollmentPayment(
  entry: EntryManagementEntry,
  recorded: RecordedEnrollmentPayment
): EntryManagementEntry {
  const status = recorded.payment_status as PaymentStatus;
  const serverEntryStatus = recorded.entries?.find(e => e.id === entry.id)?.payment_status;
  const paymentStatus =
    serverEntryStatus != null
      ? mapPaymentStatus(serverEntryStatus)
      : hasEntryLevelRefund(entry)
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
  /** "Paid in Full: Online" (MYK9-773): no ledger row, the same server cascade. */
  markPaidOnline: (enrollmentId: string) => Promise<boolean>;
  /** Today on the show's calendar: what a received-date input starts at. */
  todayInShowZone: string;
}

/**
 * MYK9-677: Entry Management's enrollment money actions. Cash and check go
 * through the payments ledger (`record_enrollment_payment`). Online ("Paid in
 * Full: Online") is not the desk's money, so it writes no ledger row, but
 * (MYK9-773) it runs on the server too (`mark_enrollment_paid_online`), which
 * applies the same entries cascade: an entry the enrollment refunded follows,
 * an entry's own refund never does.
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

  const apply = useCallback(
    async (enrollmentId: string, write: () => Promise<RecordedEnrollmentPayment>) => {
      try {
        const recorded = await write();
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

  const record = useCallback(
    (enrollmentId: string, action: EnrollmentLedgerAction) =>
      apply(enrollmentId, () => recordEnrollmentPayment(enrollmentId, action)),
    [apply]
  );

  const markPaidOnline = useCallback(
    (enrollmentId: string) => apply(enrollmentId, () => markEnrollmentPaidOnline(enrollmentId)),
    [apply]
  );

  return useMemo(
    () => ({ record, markPaidOnline, todayInShowZone }),
    [record, markPaidOnline, todayInShowZone]
  );
}
