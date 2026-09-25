import type { LedgerMethod } from '@/features/payments/showPaymentLedger';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';

export const RECEIVED_METHOD_REQUIRED_MESSAGE =
  'Choose whether the payment was received as cash or check.';

/**
 * MYK9-677: for "Secretary Payment (Already Received)", the cash/check method
 * the secretary chose, or `null` for any other payment method.
 */
export function secretaryReceivedMethod(
  paymentMethod: PaymentMethod | undefined,
  paymentDetails: PaymentDetails | undefined
): LedgerMethod | null {
  if (paymentMethod !== 'secretary_paid') return null;
  return paymentDetails?.receivedMethod ?? null;
}

/**
 * Money received with no method named is refused BEFORE anything is written:
 * the ledger has no row for an unnamed channel, and a $0 entry needs none.
 */
export function assertReceivedMethodChosen(
  paymentMethod: PaymentMethod | undefined,
  paymentDetails: PaymentDetails | undefined,
  totalDollars: number
): void {
  if (
    paymentMethod === 'secretary_paid' &&
    totalDollars > 0 &&
    !secretaryReceivedMethod(paymentMethod, paymentDetails)
  ) {
    throw new Error(RECEIVED_METHOD_REQUIRED_MESSAGE);
  }
}
