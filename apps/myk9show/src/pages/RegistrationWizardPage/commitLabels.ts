import type { PaymentMethod } from '@/types/show-registration-types';

/**
 * Honest, method-aware label for the Payment-step commit button
 * (UX walk remediation 4.A).
 *
 * The entry is written the moment this button is pressed, so the label must SAY
 * so — never a bare "Next", which hid the commit and made the following screen
 * feel like it auto-submitted. For cash/check it also names the real obligation
 * ("pay cash at show" / "mail check") so an exhibitor knows they are DONE here,
 * not that money is owed online right now — the same confusion the "Finish
 * Payment" nag caused on cash entries (4.C).
 */
export function getPaymentSubmitLabel(paymentMethod: PaymentMethod | undefined): string {
  switch (paymentMethod) {
    case 'credit_card':
      return 'Submit & pay';
    case 'cash':
      return 'Submit — pay cash at show';
    case 'check':
      return 'Submit — mail check';
    // secretary_paid / group_payment / waived are staff-recorded or no-charge:
    // the money side is already handled, so the button is a plain honest commit.
    case 'secretary_paid':
    case 'group_payment':
    case 'waived':
      return 'Submit entry';
    default:
      return 'Submit entry';
  }
}
