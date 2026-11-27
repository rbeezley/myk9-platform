import { useState } from 'react';
import type { EnrollmentLedgerControls } from '@/hooks/useEnrollmentLedgerActions';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  EMPTY_LEDGER_CONFIRM,
  EMPTY_PARTIAL_DIALOG,
  enrollmentRemainingDollars,
  formMoneyUnknown,
  formTotalDollars,
  netReceivedDollars,
  paidInFullCents,
  receivedDollars,
  resolvePartialPayment,
  type LedgerConfirmState,
  type PartialDialog,
} from './enrollmentPayment';
import { useDeskPaymentLines } from '@/features/payments/deskPayments/useDeskPaymentLines';
import { useLedgerDialogSave } from './useLedgerDialogSave';
import { usePaymentAttemptId } from './usePaymentAttemptId';

/**
 * The form-level dialogs (the cash and check payment, the paid-online and
 * payment-due confirm, email) and the money
 * figures they read, held in ONE place so the entry form's checklist, its header
 * menu and the Payment section open the very same dialog instances and call the
 * same ledger handlers (MYK9-1600). The dialogs themselves render in
 * `EnrollmentCard`; this hook only owns their state and confirm handlers. It also reads
 * the form's payments held on this device (MYK9-2479), which the Payment section shows;
 * `readDeskPayments: false` skips that read for a caller
 * whose controls are not the ones on screen.
 */
export function useEnrollmentDialogControls(
  group: EnrollmentGroup & { exhibitorName?: string | undefined },
  paymentLedger: EnrollmentLedgerControls,
  { readDeskPayments = true }: { readDeskPayments?: boolean } = {}
) {
  const [partialDialog, setPartialDialog] = useState<PartialDialog>(EMPTY_PARTIAL_DIALOG);
  const [ledgerConfirm, setLedgerConfirm] = useState<LedgerConfirmState>(EMPTY_LEDGER_CONFIRM);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const partialSave = useLedgerDialogSave();
  // MYK9-1936: the dialog's payment keeps its own id across a retry of the same payment.
  const partialAttempt = usePaymentAttemptId();

  const enrollmentId = group.enrollmentId ?? '';
  const totalDollars = formTotalDollars(group);
  // Money received, desk and card (MYK9-1637): what "Paid in Full" charges the rest of.
  const paidDollars = receivedDollars(group);
  // What the desk may hand back: desk money only (card money is refunded through Stripe).
  const refundableDollars = netReceivedDollars(group);
  const remainingDollars = enrollmentRemainingDollars(group);
  // What "Paid in Full" fills in: the due, never below zero (a payment reopens nothing),
  // in whole cents (MYK9-2479): the amount in the box is the amount sent, on every replay.
  const fullPaymentCents = paidInFullCents(group);
  // MYK9-2479: a cash or check payment is saved on this device first, named by its form.
  const form = {
    showId: group.entries[0]?.showId ?? '',
    exhibitorName: group.exhibitorName ?? group.entries[0]?.ownerName ?? '',
  };
  // MYK9-1968: the form's money cannot be traced (its enrollment row did not load, or a
  // move-up's money root is missing), so the figures above are not the form's: every surface
  // reading these controls says the amount is not available instead of quoting them.
  const amountUnknown = formMoneyUnknown(group);
  const today = paymentLedger.todayInShowZone;
  const deskPayments = useDeskPaymentLines(
    readDeskPayments ? form.showId || undefined : undefined,
    group.enrollmentId
  );

  // MYK9-1841: "Paid in Full: Online" and "Payment Due" change what the whole
  // form owes, so both ask once first, like every other item in the menu. Both
  // menus (the Payment section's and the checklist's) call these openers.
  const askMarkPaidOnline = () => setLedgerConfirm({ open: true, kind: 'paid-online' });
  const askMarkPaymentDue = () => setLedgerConfirm({ open: true, kind: 'payment-due' });
  const closeLedgerConfirm = () => setLedgerConfirm(current => ({ ...current, open: false }));

  const confirmLedgerChange = () => {
    if (enrollmentId) {
      if (ledgerConfirm.kind === 'paid-online') {
        // Online money is not the desk's (no ledger row), but the server runs the
        // same entries cascade as a desk payment (MYK9-773).
        void paymentLedger.markPaidOnline(enrollmentId);
      } else {
        void paymentLedger.record(enrollmentId, { kind: 'reversal' });
      }
    }
    closeLedgerConfirm();
  };

  // MYK9-677: cash and check money goes through the payments ledger, one row
  // per payment with the day it was received.
  const openPaymentDialog = (method: PartialDialog['method'], amountPaid: string) => {
    partialSave.reset();
    partialAttempt.clear();
    setPartialDialog({ open: true, amountPaid, method, checkNumber: '', receivedOn: today });
  };

  const openPartialPayment = () => openPaymentDialog('cash', '');

  // MYK9-2479 (owner's Option A, Codex round 3 on #4461): "Paid in Full" by cash or check
  // is the same dialog with the server's balance due filled in. She confirms or edits it,
  // and the typed amount is sent: nothing records "whatever is due" on its own. Empty when
  // the due is not known, or nothing is due.
  const openFullPayment = (method: PartialDialog['method']) =>
    openPaymentDialog(
      method,
      !amountUnknown && fullPaymentCents > 0 ? (fullPaymentCents / 100).toFixed(2) : ''
    );

  // MYK9-2156: the dialog closes only once its write succeeds; a failed write
  // keeps it open with what was typed (useLedgerDialogSave).
  const confirmPartialPayment = () => {
    const result = resolvePartialPayment(
      partialDialog.amountPaid,
      partialDialog.method,
      partialDialog.checkNumber,
      partialDialog.receivedOn
    );
    if (!result || !enrollmentId) return;
    const action = partialAttempt.withId(enrollmentId, result);
    void partialSave.save(
      () => paymentLedger.record(enrollmentId, action, form),
      () => {
        partialAttempt.clear();
        setPartialDialog(EMPTY_PARTIAL_DIALOG);
      }
    );
  };

  return {
    enrollmentId,
    totalDollars,
    paidDollars,
    refundableDollars,
    remainingDollars,
    amountUnknown,
    today,
    deskPayments,
    partialDialog,
    setPartialDialog,
    partialSaveStatus: partialSave.status,
    askMarkPaidOnline,
    askMarkPaymentDue,
    ledgerConfirm,
    closeLedgerConfirm,
    confirmLedgerChange,
    openFullPayment,
    openPartialPayment,
    confirmPartialPayment,
    email: {
      open: emailOpen,
      setOpen: setEmailOpen,
      message: emailMessage,
      setMessage: setEmailMessage,
      isSending: isSendingEmail,
      setIsSending: setIsSendingEmail,
      openDialog: () => {
        setEmailMessage('');
        setEmailOpen(true);
      },
    },
  };
}

export type EnrollmentDialogControls = ReturnType<typeof useEnrollmentDialogControls>;
