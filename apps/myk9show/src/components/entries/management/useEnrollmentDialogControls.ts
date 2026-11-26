import { useState } from 'react';
import type { EnrollmentLedgerControls } from '@/hooks/useEnrollmentLedgerActions';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  EMPTY_FULL_PAYMENT_DIALOG,
  EMPTY_LEDGER_CONFIRM,
  EMPTY_PARTIAL_DIALOG,
  enrollmentRemainingDollars,
  formMoneyUnknown,
  formTotalDollars,
  netReceivedDollars,
  paidInFullDollars,
  receivedDollars,
  resolvePartialPayment,
  type FullPaymentDialog,
  type LedgerConfirmState,
  type PartialDialog,
} from './enrollmentPayment';
import { useLedgerDialogSave } from './useLedgerDialogSave';
import { usePaymentAttemptId } from './usePaymentAttemptId';

/**
 * The form-level dialogs (full payment, partial payment, the paid-online and
 * payment-due confirm, email) and the money
 * figures they read, held in ONE place so the entry form's checklist, its header
 * menu and the Payment section open the very same dialog instances and call the
 * same ledger handlers (MYK9-1600). The dialogs themselves render in
 * `EnrollmentCard`; this hook only owns their state and confirm handlers.
 */
export function useEnrollmentDialogControls(
  group: EnrollmentGroup,
  paymentLedger: EnrollmentLedgerControls
) {
  const [fullDialog, setFullDialog] = useState<FullPaymentDialog>(EMPTY_FULL_PAYMENT_DIALOG);
  const [partialDialog, setPartialDialog] = useState<PartialDialog>(EMPTY_PARTIAL_DIALOG);
  const [ledgerConfirm, setLedgerConfirm] = useState<LedgerConfirmState>(EMPTY_LEDGER_CONFIRM);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const fullSave = useLedgerDialogSave();
  const partialSave = useLedgerDialogSave();
  // MYK9-1936: each dialog's payment keeps its own id across a retry of the same payment.
  const fullAttempt = usePaymentAttemptId();
  const partialAttempt = usePaymentAttemptId();

  const enrollmentId = group.enrollmentId ?? '';
  const totalDollars = formTotalDollars(group);
  // Money received, desk and card (MYK9-1637): what "Paid in Full" charges the rest of.
  const paidDollars = receivedDollars(group);
  // What the desk may hand back: desk money only (card money is refunded through Stripe).
  const refundableDollars = netReceivedDollars(group);
  const remainingDollars = enrollmentRemainingDollars(group);
  // What "Paid in Full" records: the due, never below zero (a payment reopens nothing).
  const fullPaymentDollars = paidInFullDollars(group);
  // MYK9-1968: the form's money cannot be traced (its enrollment row did not load, or a
  // move-up's money root is missing), so the figures above are not the form's: every surface
  // reading these controls says the amount is not available instead of quoting them.
  const amountUnknown = formMoneyUnknown(group);
  const today = paymentLedger.todayInShowZone;

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
  const openFullPayment = (method: FullPaymentDialog['method']) => {
    fullSave.reset();
    fullAttempt.clear();
    setFullDialog({ open: true, method, checkNumber: '', receivedOn: today });
  };

  const openPartialPayment = () => {
    partialSave.reset();
    partialAttempt.clear();
    setPartialDialog({
      open: true,
      amountPaid: '',
      method: 'cash',
      checkNumber: '',
      receivedOn: today,
    });
  };

  // MYK9-2156: each dialog closes only once its write succeeds; a failed write
  // keeps it open with what was typed (useLedgerDialogSave).
  const confirmFullPayment = () => {
    if (!enrollmentId || !fullDialog.receivedOn) return;
    const action = fullAttempt.withId(enrollmentId, {
      kind: 'payment',
      method: fullDialog.method,
      amount: null,
      receivedOn: fullDialog.receivedOn,
      reference: fullDialog.method === 'check' ? fullDialog.checkNumber : null,
    });
    void fullSave.save(
      () => paymentLedger.record(enrollmentId, action),
      () => {
        fullAttempt.clear();
        setFullDialog(EMPTY_FULL_PAYMENT_DIALOG);
      }
    );
  };

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
      () => paymentLedger.record(enrollmentId, action),
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
    fullPaymentDollars,
    amountUnknown,
    today,
    fullDialog,
    setFullDialog,
    fullSaveStatus: fullSave.status,
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
    confirmFullPayment,
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
