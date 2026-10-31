import { useState } from 'react';
import type { EnrollmentLedgerControls } from '@/hooks/useEnrollmentLedgerActions';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  EMPTY_FULL_PAYMENT_DIALOG,
  EMPTY_PARTIAL_DIALOG,
  netReceivedDollars,
  resolvePartialPayment,
  type FullPaymentDialog,
  type PartialDialog,
} from './enrollmentPayment';

/**
 * The form-level dialogs (full payment, partial payment, email) and the money
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
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const enrollmentId = group.enrollmentId ?? '';
  const totalDollars =
    group.totalAmountUnit === 'cents' ? group.totalAmount / 100 : group.totalAmount;
  // Net received (MYK9-677): what the club still holds, the figure
  // record_enrollment_payment caps refunds by and charges "Paid in Full" from.
  const paidDollars = netReceivedDollars(group);
  const remainingDollars = totalDollars - paidDollars;
  const today = paymentLedger.todayInShowZone;

  // Online money is not the desk's (no ledger row), but the server runs the
  // same entries cascade as a desk payment (MYK9-773).
  const markPaidOnline = () => {
    if (enrollmentId) void paymentLedger.markPaidOnline(enrollmentId);
  };

  // MYK9-677: cash and check money goes through the payments ledger, one row
  // per payment with the day it was received.
  const openFullPayment = (method: FullPaymentDialog['method']) =>
    setFullDialog({ open: true, method, checkNumber: '', receivedOn: today });

  const openPartialPayment = () =>
    setPartialDialog({
      open: true,
      amountPaid: '',
      method: 'cash',
      checkNumber: '',
      receivedOn: today,
    });

  const confirmFullPayment = () => {
    if (!enrollmentId || !fullDialog.receivedOn) return;
    void paymentLedger.record(enrollmentId, {
      kind: 'payment',
      method: fullDialog.method,
      amount: null,
      receivedOn: fullDialog.receivedOn,
      reference: fullDialog.method === 'check' ? fullDialog.checkNumber : null,
    });
    setFullDialog(EMPTY_FULL_PAYMENT_DIALOG);
  };

  const confirmPartialPayment = () => {
    const result = resolvePartialPayment(
      partialDialog.amountPaid,
      partialDialog.method,
      partialDialog.checkNumber,
      partialDialog.receivedOn
    );
    if (!result || !enrollmentId) return;
    void paymentLedger.record(enrollmentId, result);
    setPartialDialog(EMPTY_PARTIAL_DIALOG);
  };

  return {
    enrollmentId,
    totalDollars,
    paidDollars,
    remainingDollars,
    today,
    fullDialog,
    setFullDialog,
    partialDialog,
    setPartialDialog,
    markPaidOnline,
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
