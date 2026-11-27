import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { currentCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import type {
  EnrollmentLedgerAction,
  RecordedEnrollmentPayment,
} from '@/features/payments/showPaymentLedger';
import type { DeskPaymentForm } from '@/features/payments/deskPayments/deskPaymentTypes';
import {
  CHANGED_RETRY_REFUSAL,
  errorCodeOf,
  isFriendlyRefusal,
  NOT_AUTHORIZED_CODE,
  RPC_REFUSAL_CODE,
} from '@/features/payments/deskPayments/paymentRefusals';
import { saveDeskPayment } from '@/features/payments/deskPayments/saveDeskPayment';
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

const LEDGER_NOT_AUTHORIZED = 'You do not have permission to record payments for this entry.';
// Anything else, including a lost connection after the server saved it. A retry
// of the same payment from its dialog carries the same id and is recorded once
// (MYK9-1936); a refund carries no id, so the secretary still checks first.
const LEDGER_UNCONFIRMED =
  "We could not confirm this was saved. Check the entry's payments: if it is not there, try again.";

const LEDGER_CHANGED_RETRY =
  "This payment may already be saved with the earlier date or check number. Check the entry's payments before saving again.";

// Every 22023 is raised before either RPC writes a row, so "not recorded" is
// true here; the cause is on our side, not something the secretary typed.
const LEDGER_REFUSED_TECHNICAL =
  'Payment not recorded. Something went wrong with this request. Restart the app and try again.';

/**
 * MYK9-2156: how a ledger write ended. `failed` is a refusal raised before the
 * RPC writes anything, so nothing was recorded; `unconfirmed` is anything else
 * (a lost connection, a timeout), where the server may have saved it and a
 * retry could record the payment twice. MYK9-2479: `queued` is a cash or check
 * payment saved on this device that the queue sends (again) under the same id.
 */
export type LedgerWriteOutcome = 'saved' | 'queued' | 'failed' | 'unconfirmed';

/** MYK9-2479: the payment is on this device and goes out on its own. */
const QUEUED_OFFLINE =
  'Payment saved on this device. It will be sent on its own when the connection returns.';
const QUEUED_UNCONFIRMED =
  'Payment saved on this device, not confirmed yet. It will be sent again on its own.';
/** The plan's § 3 note: the payment could not be kept on this device. */
const NOT_SAVED_OFFLINE =
  "No connection. Write the payment down and record it here when you're back online.";

/**
 * MYK9-1824: what the secretary reads when a payment write fails. The RPCs'
 * refusals written for a person keep their reason (MYK9-677, MYK9-773: "says
 * why"); nothing else is shown raw, and the logger keeps the raw error.
 */
function ledgerFailure(err: unknown): {
  outcome: Exclude<LedgerWriteOutcome, 'saved'>;
  message: string;
} {
  const code = errorCodeOf(err);
  if (
    code === RPC_REFUSAL_CODE &&
    err instanceof Error &&
    CHANGED_RETRY_REFUSAL.test(err.message)
  ) {
    // The dialog then asks to check the form's payments, never "Not saved".
    return { outcome: 'unconfirmed', message: LEDGER_CHANGED_RETRY };
  }
  if (code === RPC_REFUSAL_CODE && err instanceof Error) {
    return {
      outcome: 'failed',
      message: isFriendlyRefusal(err.message)
        ? `Payment not recorded: ${err.message}`
        : LEDGER_REFUSED_TECHNICAL,
    };
  }
  if (code === NOT_AUTHORIZED_CODE) return { outcome: 'failed', message: LEDGER_NOT_AUTHORIZED };
  return { outcome: 'unconfirmed', message: LEDGER_UNCONFIRMED };
}

type PaymentAction = Extract<EnrollmentLedgerAction, { kind: 'payment' }>;

/** One function that satisfies both `record` overloads: what the hook builds and tests mock. */
export type EnrollmentLedgerRecordImpl = (
  enrollmentId: string,
  action: EnrollmentLedgerAction,
  form?: DeskPaymentForm
) => Promise<LedgerWriteOutcome>;

export interface EnrollmentLedgerControls {
  /**
   * Records one cash/check payment, refund or "Payment Due" reset (MYK9-2156: says how
   * it ended). A cash or check payment names its form (MYK9-2479): it is saved on this
   * device first, with the show and exhibitor its line shows.
   */
  record: {
    (
      enrollmentId: string,
      action: Exclude<EnrollmentLedgerAction, { kind: 'payment' }>
    ): Promise<LedgerWriteOutcome>;
    (
      enrollmentId: string,
      action: PaymentAction,
      form: DeskPaymentForm
    ): Promise<LedgerWriteOutcome>;
  };
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
 * MYK9-2479: a cash or check payment the server has not answered is shown BESIDE
 * the balance (`DeskPaymentLines`), never added into it.
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
    async (
      enrollmentId: string,
      write: () => Promise<RecordedEnrollmentPayment>
    ): Promise<LedgerWriteOutcome> => {
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
        return 'saved';
      } catch (err) {
        const failure = ledgerFailure(err);
        toast.error(failure.message);
        logger.error('Error recording enrollment payment:', 'secretary', {}, err as Error);
        return failure.outcome;
      }
    },
    [queryClient, setEntries]
  );

  /**
   * MYK9-2479: a cash or check payment is saved on this device first and sent with a
   * bounded wait; with no answer it stays queued under the same id and is sent again on
   * its own. A refusal inside the wait stays in the dialog, as before.
   */
  const recordPayment = useCallback(
    async (
      enrollmentId: string,
      action: PaymentAction,
      form: DeskPaymentForm
    ): Promise<LedgerWriteOutcome> => {
      const result = await saveDeskPayment(enrollmentId, action, form);
      if (result.kind === 'saved') return apply(enrollmentId, async () => result.recorded);
      if (result.kind === 'refused') return apply(enrollmentId, () => Promise.reject(result.error));
      if (result.kind === 'queued') {
        toast.warning(result.sendBegun ? QUEUED_UNCONFIRMED : QUEUED_OFFLINE);
        return 'queued';
      }
      logger.error(
        'Desk payment not saved on this device:',
        'secretary',
        {},
        result.error as Error
      );
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast.error(NOT_SAVED_OFFLINE);
        return 'failed';
      }
      // Online with no way to keep it here: send it as before, answer or nothing.
      return apply(enrollmentId, () => recordEnrollmentPayment(enrollmentId, action));
    },
    [apply]
  );

  const record = useCallback<EnrollmentLedgerRecordImpl>(
    (enrollmentId, action, form) =>
      action.kind === 'payment' && form
        ? recordPayment(enrollmentId, action, form)
        : apply(enrollmentId, () => recordEnrollmentPayment(enrollmentId, action)),
    [apply, recordPayment]
  );

  const markPaidOnline = useCallback(
    async (enrollmentId: string) =>
      (await apply(enrollmentId, () => markEnrollmentPaidOnline(enrollmentId))) === 'saved',
    [apply]
  );

  return useMemo(
    () => ({ record, markPaidOnline, todayInShowZone }),
    [record, markPaidOnline, todayInShowZone]
  );
}
