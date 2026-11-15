import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '@/types/show-registration-types';
import { getPaymentSubmitLabel } from './commitLabels';

describe('getPaymentSubmitLabel (4.A honest commit)', () => {
  it.each([
    ['credit_card', 'Submit & pay'],
    ['cash', 'Submit, pay cash at show'],
    ['check', 'Submit, bring check to show'],
    ['waived', 'Submit entry'],
    ['secretary_paid', 'Submit entry'],
    ['group_payment', 'Submit entry'],
  ] satisfies Array<[PaymentMethod, string]>)('labels %s as "%s"', (method, expected) => {
    expect(getPaymentSubmitLabel(method)).toBe(expected);
  });

  it('never renders a bare "Next" — undefined falls back to a real commit label', () => {
    expect(getPaymentSubmitLabel(undefined)).toBe('Submit entry');
  });
});

describe('getPaymentSubmitLabel with the amount due (MYK9-1964)', () => {
  it('names the total for card, since the press opens Stripe', () => {
    expect(getPaymentSubmitLabel('credit_card', 3210)).toBe('Pay $32.10');
  });

  it('keeps the plain card label while the total is not known', () => {
    expect(getPaymentSubmitLabel('credit_card', null)).toBe('Submit & pay');
    expect(getPaymentSubmitLabel('credit_card', 0)).toBe('Submit & pay');
  });

  it.each([
    ['cash', 'Submit, pay cash at show'],
    ['check', 'Submit, bring check to show'],
  ] satisfies Array<[PaymentMethod, string]>)(
    'leaves %s unchanged by an amount',
    (method, label) => {
      expect(getPaymentSubmitLabel(method, 3210)).toBe(label);
    }
  );
});
