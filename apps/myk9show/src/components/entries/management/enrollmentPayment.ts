import { PaymentStatus } from '@/types/show-registration-types';

/**
 * Shared types, constants, and pure resolution helpers for the manual
 * payment / refund flows on an EnrollmentCard. Extracted from
 * EnrollmentCard.tsx (which was over the 500-line limit) so the dialog
 * components and the card can share one source of truth.
 */

export type CheckDialog = { open: boolean; checkNumber: string };
export type PartialDialog = {
  open: boolean;
  amountPaid: string;
  method: 'cash' | 'check';
  checkNumber: string;
};
export type RefundDialog = {
  open: boolean;
  amount: string;
  method: 'check_mailed' | 'cash_returned' | 'stripe' | 'other';
  notes: string;
  isPartial: boolean;
};

export const EMPTY_CHECK_DIALOG: CheckDialog = { open: false, checkNumber: '' };
export const EMPTY_PARTIAL_DIALOG: PartialDialog = {
  open: false,
  amountPaid: '',
  method: 'cash',
  checkNumber: '',
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
 * Resolve a partial-payment form into the payment write, or `null` when the
 * entered amount is not a positive number. An amount that meets or exceeds the
 * total marks the enrollment paid (by the chosen method); anything less leaves
 * it PENDING with the amount recorded on account.
 */
export function resolvePartialPayment(
  amountPaid: string,
  totalDollars: number,
  method: PartialDialog['method'],
  checkNumber: string
): { status: PaymentStatus; reference: string | null; amount: number } | null {
  const amount = parseFloat(amountPaid);
  if (isNaN(amount) || amount <= 0) return null;

  const status =
    amount >= totalDollars
      ? method === 'check'
        ? PaymentStatus.PAID_BY_CHECK
        : PaymentStatus.PAID_BY_CASH
      : PaymentStatus.PENDING;

  const reference = method === 'check' ? checkNumber || null : null;
  return { status, reference, amount };
}

/**
 * Resolve a refund form into the payment write, or `null` when the entered
 * amount is not a positive number. A full refund (or a "partial" that covers
 * the whole paid amount) lands as REFUNDED; a smaller partial as PARTIAL_REFUND.
 * Notes are prefixed with the human-readable method label.
 */
export function resolveRefund(
  amountStr: string,
  paidDollars: number,
  isPartial: boolean,
  method: RefundDialog['method'],
  notes: string
): { status: PaymentStatus; amount: number; notes: string | null } | null {
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  const status =
    !isPartial || amount >= paidDollars ? PaymentStatus.REFUNDED : PaymentStatus.PARTIAL_REFUND;
  const methodLabel = REFUND_METHODS.find(m => m.value === method)?.label ?? method;
  const combined = [methodLabel, notes.trim()].filter(Boolean).join(': ');
  return { status, amount, notes: combined || null };
}
