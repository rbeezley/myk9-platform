import type { PaymentDetails, PaymentMethod, PaymentStatus } from '@/types/show-registration-types';
import { FREE_ENTRY_AMOUNT_LABEL, isFreeEntry } from '@/utils/entryAmountOwed';

/**
 * The receipt's amount and the label beside it.
 *
 * MYK9-1908: a Free entry owes nothing, so its receipt says so rather than quoting the class
 * fee. The server records a `waived` submission as payment_status 'waived'.
 */
export function receiptTotal(input: {
  /** The desk read that the exhibitor's form already held money before this submit. */
  formHeldMoney: boolean;
  paymentMethod: PaymentMethod | '' | undefined;
  receivedMethod: PaymentDetails['receivedMethod'];
  paymentStatus: PaymentStatus;
  totalFees: number;
}): { totalFeesFormatted: string; totalLabel: string } {
  const isFree =
    input.paymentMethod === 'waived' || isFreeEntry({ paymentStatus: input.paymentStatus });
  return {
    totalFeesFormatted: isFree ? FREE_ENTRY_AMOUNT_LABEL : `$${input.totalFees.toFixed(2)}`,
    totalLabel: receiptTotalLabel(input.paymentMethod, input.receivedMethod, input.formHeldMoney),
  };
}

/**
 * MYK9-2235: the label beside the total on the entry receipt. Every receipt style shows it
 * (Heritage, Magazine, Monogram and Gazette under the confirmation number).
 *
 * The receipt is shown right after the entry is written. Card payments never reach it (they
 * leave for Stripe and come back to the checkout success page), so the method the wizard just
 * submitted says what happened to the money:
 *
 * - "Check received" / "Cash received" (`secretary_paid`): paid with the entry.
 * - "Paid by a club or group" (`group_payment`): paid.
 * - Check or cash at the show (`check` / `cash`): still owed, at the show. Not when the desk
 *   read that the form already held money: the server pays what it can from that money, so
 *   the label says only "Total" and the form-money notice on the same screen says what is owed.
 * - Free entry, money already on the form, or unknown: just "Total". The amount already says
 *   Free entry, and the form-money notice on the same screen says what is still owed.
 */
export function receiptTotalLabel(
  paymentMethod: PaymentMethod | '' | undefined,
  receivedMethod: PaymentDetails['receivedMethod'],
  formHeldMoney = false
): string {
  switch (paymentMethod) {
    case 'secretary_paid':
      if (receivedMethod === 'check') return 'Total · Paid by check';
      if (receivedMethod === 'cash') return 'Total · Paid by cash';
      return 'Total · Paid';
    case 'group_payment':
      return 'Total · Paid by a club or group';
    case 'check':
    case 'cash':
      return formHeldMoney ? 'Total' : 'Total · Due at the show';
    default:
      return 'Total';
  }
}
