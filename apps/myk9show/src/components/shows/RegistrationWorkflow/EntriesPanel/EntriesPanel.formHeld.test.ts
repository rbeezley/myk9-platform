/**
 * MYK9-2149: when the exhibitor's form already holds money, the desk total is never quoted
 * as received (no money is taken at submission) and the held money is shown from the
 * server's figure, never subtracted from a local fee.
 */
import { describe, expect, it } from 'vitest';
import { computePaymentTotals, formatAmountDue, withFormHeld } from './EntriesPanel.helpers';
import type { FeeCalculationResult } from '../PaymentStep/types';

const feeCalculation: FeeCalculationResult = {
  subtotal: 30,
  discounts: [],
  taxes: 0,
  total: 30,
  breakdown: [],
};
const rates = { percent: 7, flatCents: 0, minCents: 0 };
const totalsFor = (paymentMethod: 'secretary_paid' | 'waived') =>
  computePaymentTotals({ paymentMethod, feeCalculation, capacityReady: true, rates });
const headline = (totals: ReturnType<typeof computePaymentTotals>) =>
  formatAmountDue({ capacityReady: true, totals, entryFeeCents: 3000, classCount: 1 });

describe('the desk total when the form holds money (MYK9-2149)', () => {
  it('is not quoted as received, and carries the held figure as it is', () => {
    const totals = withFormHeld(totalsFor('secretary_paid'), 4000);

    expect(totals).toMatchObject({
      amountDueCents: 3000,
      formHeldCents: 4000,
      isSecretaryReceived: false,
    });
    expect(headline(totals)).toBe('$30.00 (before money on this form)');
  });

  it('is unchanged when the form holds nothing or the money is unknown', () => {
    const totals = totalsFor('secretary_paid');

    expect(withFormHeld(totals, null)).toBe(totals);
    expect(headline(withFormHeld(totals, null))).toBe('$30.00 (Received)');
  });

  it('leaves a Free entry as a Free entry', () => {
    const totals = totalsFor('waived');

    expect(withFormHeld(totals, 4000)).toBe(totals);
  });
});
