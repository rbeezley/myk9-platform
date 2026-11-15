import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '@/types/show-registration-types';
import type { PaymentTotals } from '@/components/shows/RegistrationWorkflow/EntriesPanel/EntriesPanel.helpers';
import { getPaymentSubmitLabel } from './commitLabels';

function totals(isPayableCard: boolean): PaymentTotals {
  return {
    isWaived: false,
    isSecretaryReceived: false,
    isPayableCard,
    entryFeeCents: isPayableCard ? 3000 : 0,
    serviceFeeCents: isPayableCard ? 210 : 0,
    amountDueCents: isPayableCard ? 3210 : 0,
    requiresPaymentMethod: false,
  };
}

describe('getPaymentSubmitLabel (4.A honest commit)', () => {
  it.each([
    ['credit_card', 'Pay'],
    ['cash', 'Submit, pay cash at show'],
    ['check', 'Submit, bring check to show'],
    ['waived', 'Submit entry'],
    ['secretary_paid', 'Submit entry'],
    ['group_payment', 'Submit entry'],
  ] satisfies Array<[PaymentMethod, string]>)('labels %s as "%s"', (method, expected) => {
    expect(getPaymentSubmitLabel(method)).toBe(expected);
  });

  // MYK9-1964: card opens Stripe from this button, so it names the amount.
  it('names the amount due for card once it is known', () => {
    expect(
      getPaymentSubmitLabel('credit_card', {
        capacityReady: true,
        headline: '$32.10',
        totals: totals(true),
      })
    ).toBe('Pay $32.10');
  });

  it('only submits a card entry that owes nothing (every class wait-listed)', () => {
    expect(
      getPaymentSubmitLabel('credit_card', {
        capacityReady: true,
        headline: '$0.00',
        totals: totals(false),
      })
    ).toBe('Submit entry');
  });

  it('never names an amount for a method other than card', () => {
    expect(
      getPaymentSubmitLabel('check', {
        capacityReady: true,
        headline: '$32.10',
        totals: totals(false),
      })
    ).toBe('Submit, bring check to show');
  });

  it('never renders a bare "Next" — undefined falls back to a real commit label', () => {
    expect(getPaymentSubmitLabel(undefined)).toBe('Submit entry');
  });
});
