import { describe, expect, it } from 'vitest';
import type { PaymentMethod } from '@/types/show-registration-types';
import { getPaymentSubmitLabel } from './commitLabels';

describe('getPaymentSubmitLabel (4.A honest commit)', () => {
  it.each([
    ['credit_card', 'Submit & pay'],
    ['cash', 'Submit — pay cash at show'],
    ['check', 'Submit — mail check'],
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
