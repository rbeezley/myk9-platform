import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';

/**
 * One desk choice. "Check received" and "Cash received" are both the stored
 * `secretary_paid` method, told apart by `receivedMethod` (MYK9-677); naming
 * them as two choices puts the posted check on the screen in the secretary's
 * words instead of behind "Secretary Payment (Already Received)" (MYK9-2020).
 */
export type DeskChoice =
  'check_received' | 'cash_received' | 'group_payment' | 'check' | 'cash' | 'waived';

export function deskChoiceFor(
  paymentMethod: PaymentMethod | '',
  receivedMethod: PaymentDetails['receivedMethod']
): DeskChoice | null {
  switch (paymentMethod) {
    case 'secretary_paid':
      if (receivedMethod === 'check') return 'check_received';
      if (receivedMethod === 'cash') return 'cash_received';
      return null;
    case 'group_payment':
    case 'check':
    case 'cash':
    case 'waived':
      return paymentMethod;
    default:
      return null;
  }
}
