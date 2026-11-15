import type { PaymentMethod } from '@/types/show-registration-types';
import type { EntriesPanelMoney } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.money';

/**
 * Honest, method-aware label for the Payment-step commit button
 * (UX walk remediation 4.A).
 *
 * The entry is written the moment this button is pressed, so the label must SAY
 * so — never a bare "Next", which hid the commit and made the following screen
 * feel like it auto-submitted. For cash/check it also names the real obligation
 * ("pay cash at show" / "bring check to show") so an exhibitor knows they are
 * DONE here, not that money is owed online right now — the same confusion the "Finish
 * Payment" nag caused on cash entries (4.C).
 */
export function getPaymentSubmitLabel(
  paymentMethod: PaymentMethod | undefined,
  money?: Pick<EntriesPanelMoney, 'capacityReady' | 'totals' | 'headline'> | undefined
): string {
  switch (paymentMethod) {
    case 'credit_card':
      return cardSubmitLabel(money);
    case 'cash':
      return 'Submit, pay cash at show';
    case 'check':
      return 'Submit, bring check to show';
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

/**
 * MYK9-1964: card opens Stripe straight from this button, so it names the
 * amount, read from the entries panel's own figures ("Total due"). Before the
 * figure is known it is a plain "Pay"; a card entry that owes nothing once
 * known (every class went to a wait list) only submits, and says so.
 */
function cardSubmitLabel(
  money: Pick<EntriesPanelMoney, 'capacityReady' | 'totals' | 'headline'> | undefined
): string {
  if (money?.totals?.isPayableCard) return `Pay ${money.headline}`;
  if (money?.capacityReady && money.totals) return 'Submit entry';
  return 'Pay';
}
