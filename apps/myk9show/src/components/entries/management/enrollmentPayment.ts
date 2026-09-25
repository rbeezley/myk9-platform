import { PaymentStatus } from '@/types/show-registration-types';
import type { EnrollmentLedgerAction, LedgerMethod } from '@/features/payments/showPaymentLedger';
import type { EnrollmentGroup } from '@/utils/enrollmentGrouping';

/**
 * Shared types, constants, and pure resolution helpers for the manual
 * payment / refund flows on an EnrollmentCard. Extracted from
 * EnrollmentCard.tsx (which was over the 500-line limit) so the dialog
 * components and the card can share one source of truth.
 */

/** "Paid in Full" by cash or check: pays whatever is still due. */
export type FullPaymentDialog = {
  open: boolean;
  method: LedgerMethod;
  checkNumber: string;
  /** `YYYY-MM-DD` on the show's calendar; a check banked earlier keeps its day. */
  receivedOn: string;
};
export type PartialDialog = {
  open: boolean;
  amountPaid: string;
  method: LedgerMethod;
  checkNumber: string;
  receivedOn: string;
};
export type RefundDialog = {
  open: boolean;
  amount: string;
  method: 'check_mailed' | 'cash_returned' | 'stripe' | 'other';
  notes: string;
  isPartial: boolean;
};

export const EMPTY_FULL_PAYMENT_DIALOG: FullPaymentDialog = {
  open: false,
  method: 'cash',
  checkNumber: '',
  receivedOn: '',
};
export const EMPTY_PARTIAL_DIALOG: PartialDialog = {
  open: false,
  amountPaid: '',
  method: 'cash',
  checkNumber: '',
  receivedOn: '',
};
export const EMPTY_REFUND_DIALOG: RefundDialog = {
  open: false,
  amount: '',
  method: 'check_mailed',
  notes: '',
  isPartial: false,
};

export const REFUND_METHODS: { value: RefundDialog['method']; label: string }[] = [
  { value: 'check_mailed', label: 'Check Mailed' },
  { value: 'cash_returned', label: 'Cash Returned' },
  { value: 'stripe', label: 'Stripe (manual)' },
  { value: 'other', label: 'Other' },
];

export const PAID_STATUSES = new Set([
  PaymentStatus.PAID_BY_CASH,
  PaymentStatus.PAID_BY_CHECK,
  PaymentStatus.PAID_ONLINE,
]);

/**
 * Resolve a partial-payment form into a ledger payment, or `null` when the
 * entered amount is not a positive number or no received date is set.
 *
 * MYK9-677: the amount is THIS payment. The server adds it to what was already
 * paid and marks the enrollment paid (by this method) once the total is
 * covered; before the ledger it overwrote the paid total, so a second partial
 * erased the first.
 */
export function resolvePartialPayment(
  amountPaid: string,
  method: LedgerMethod,
  checkNumber: string,
  receivedOn: string
): Extract<EnrollmentLedgerAction, { kind: 'payment' }> | null {
  const amount = parseFloat(amountPaid);
  if (isNaN(amount) || amount <= 0 || !receivedOn) return null;
  return {
    kind: 'payment',
    method,
    amount: Math.round(amount * 100) / 100,
    receivedOn,
    reference: method === 'check' ? checkNumber.trim() || null : null,
  };
}

/** What the partial-payment dialog says the balance will be after this payment. */
export function balanceAfterPayment(
  totalDollars: number,
  paidDollars: number,
  paymentDollars: number
): number {
  return Math.max(0, totalDollars - paidDollars - paymentDollars);
}

/** The refund method a desk refund leaves the cash box by, or `null` for none. */
const REFUND_LEDGER_METHOD: Record<RefundDialog['method'], LedgerMethod | null> = {
  cash_returned: 'cash',
  check_mailed: 'check',
  stripe: null,
  other: null,
};

/**
 * Resolve a refund form into a ledger refund, or `null` when the entered
 * amount is not positive or exceeds the amount paid. Notes are prefixed with
 * the human-readable method label. Cash returned and check mailed are desk
 * money and get a negative ledger row; Stripe and other do not (the server
 * still records the refund on the enrollment).
 */
export function resolveRefund(
  amountStr: string,
  paidDollars: number,
  method: RefundDialog['method'],
  notes: string,
  receivedOn: string
): Extract<EnrollmentLedgerAction, { kind: 'refund' }> | null {
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;
  if (amount > paidDollars) return null;

  const methodLabel = REFUND_METHODS.find(m => m.value === method)?.label ?? method;
  const combined = [methodLabel, notes.trim()].filter(Boolean).join(': ');
  return {
    kind: 'refund',
    method: REFUND_LEDGER_METHOD[method],
    amount,
    receivedOn,
    notes: combined || null,
  };
}

/**
 * MYK9-677: net received on an enrollment, `paid_amount - refund_amount`, the
 * same figure `record_enrollment_payment` reads for every branch. Read from the
 * enrollment's own refund column, not the group's display fallback (which sums
 * entry-level Stripe refunds when the enrollment has none), so the dialog's cap
 * and balance match what the server will accept.
 */
export function netReceivedDollars(
  group: Pick<EnrollmentGroup, 'paidAmount' | 'enrollmentId' | 'entries'>
): number {
  if (!group.enrollmentId) return group.paidAmount;
  const refunded =
    group.entries.find(entry => entry.enrollmentRefundAmount != null)?.enrollmentRefundAmount ?? 0;
  return Math.max(0, group.paidAmount - refunded);
}
