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

/** Postgres code of the RPCs' own validation refusals (every RAISE they can reach). */
const RPC_REFUSAL_CODE = '22023';
/** Postgres insufficient_privilege: raised before either RPC writes anything. */
const NOT_AUTHORIZED_CODE = '42501';

const LEDGER_NOT_AUTHORIZED = 'You do not have permission to record payments for this entry.';
// Anything else, including a lost connection after the server saved it. No
// client payment id is sent, so a blind retry could record the payment twice.
const LEDGER_UNCONFIRMED =
  "We could not confirm this was saved. Check the entry's payments: if it is not there, try again.";

/**
 * The 22023 refusals the SQL writes for the person at the desk (a date or an
 * amount they typed), matched on the exact RAISE text in
 * `record_enrollment_payment`. The same code also carries technical refusals
 * (unsupported kind, enrollment not found, client_payment_id misuse, a method
 * the form never offers); those are not listed, so they never reach the screen.
 */
const FRIENDLY_REFUSALS: readonly RegExp[] = [
  /^received date .+ is after today \(.+\) on the show's calendar$/,
  /^a payment amount must be greater than zero$/,
  /^invalid payment amount \S+$/,
  /^invalid refund amount \S*$/,
  /^refund \S+ exceeds the \S+ still held \(\S+ paid, \S+ already refunded\)$/,
];

// Every 22023 is raised before either RPC writes a row, so "not recorded" is
// true here; the cause is on our side, not something the secretary typed.
const LEDGER_REFUSED_TECHNICAL =
  'Payment not recorded. Something went wrong with this request. Reload the page and try again.';

/**
 * MYK9-1824: what the secretary reads when a payment write fails. The RPCs'
 * refusals written for a person keep their reason (MYK9-677, MYK9-773: "says
 * why"); nothing else is shown raw, and the logger keeps the raw error.
 */
function ledgerFailureMessage(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  if (code === RPC_REFUSAL_CODE && err instanceof Error) {
    return FRIENDLY_REFUSALS.some(pattern => pattern.test(err.message))
      ? `Payment not recorded: ${err.message}`
      : LEDGER_REFUSED_TECHNICAL;
  }
  if (code === NOT_AUTHORIZED_CODE) return LEDGER_NOT_AUTHORIZED;
  return LEDGER_UNCONFIRMED;
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
        toast.error(ledgerFailureMessage(err));
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
