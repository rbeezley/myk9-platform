import { PaymentStatus } from '@/types/show-registration-types';
import { dispositionOf, resolveEffectivePaymentStatus } from './effectivePaymentStatus';

/**
 * What one entry still owes, for every screen and email that tells a person
 * (MYK9-1908). A Free entry keeps its normal class fee on the row for the
 * record (`entry_fee`), so `totalFee - paidAmount` alone quoted that fee as
 * owed: the decision email said "Amount due: $60.00" to a 2-class Free entry.
 *
 * The rule, built on the one payment-status combination rule
 * (`resolveEffectivePaymentStatus`) and its money dispositions:
 *  - comped, or a `waived` disposition: nothing is owed (a Free entry);
 *  - a `refunded` disposition: nothing is owed, the money question is closed;
 *  - otherwise: the fee less what was paid and any discount, never below zero.
 *
 * It matches the server's form total (`private.enrollment_owed_cents`,
 * MYK9-1634), which never counts a waived entry.
 */
export interface EntryMoneyFacts {
  paymentStatus: PaymentStatus | null | undefined;
  enrollmentPaymentStatus?: PaymentStatus | null | undefined;
  /** `entries.card_paid`; see `resolveEffectivePaymentStatus`. */
  cardPaid?: boolean | null | undefined;
  comped?: boolean | null | undefined;
}

export interface EntryAmountOwedInput extends EntryMoneyFacts {
  /** The entry's class fee in dollars. */
  totalFee: number;
  /** Dollars already received for this entry. */
  paidAmount: number;
  /** `entries.discount_amount` in dollars, when the caller has it. */
  discountAmount?: number | null | undefined;
}

/** The amount a Free entry owes, in the payment step's wording (MYK9-1860). */
export const FREE_ENTRY_AMOUNT_LABEL = '$0.00 (Free entry)';

function effectiveDisposition(entry: EntryMoneyFacts) {
  const status = resolveEffectivePaymentStatus(
    entry.paymentStatus,
    entry.enrollmentPaymentStatus,
    entry.cardPaid
  );
  return status == null ? null : dispositionOf(status);
}

/** True for a Free entry: comped, or its money was waived. */
export function isFreeEntry(entry: EntryMoneyFacts): boolean {
  return entry.comped === true || effectiveDisposition(entry) === 'waived';
}

/** Dollars this entry still owes; 0 for a Free, comped or refunded entry. */
export function entryAmountOwed(entry: EntryAmountOwedInput): number {
  if (isFreeEntry(entry)) return 0;
  if (effectiveDisposition(entry) === 'refunded') return 0;
  const cents = (dollars: number | null | undefined) => Math.round((dollars ?? 0) * 100);
  const owedCents = cents(entry.totalFee) - cents(entry.paidAmount) - cents(entry.discountAmount);
  return Math.max(0, owedCents) / 100;
}
