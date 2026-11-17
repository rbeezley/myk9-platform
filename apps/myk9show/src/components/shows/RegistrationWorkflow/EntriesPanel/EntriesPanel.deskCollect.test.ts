/**
 * MYK9-2149: the entries panel's "Total due" says what the desk should collect once the
 * server has said how much of the entry the exhibitor's form already covers, and a covered
 * entry is never quoted as received.
 */
import { describe, expect, it } from 'vitest';
import { computePaymentTotals, formatAmountDue, withDeskCollect } from './EntriesPanel.helpers';
import type { FeeCalculationResult } from '../PaymentStep/types';

const feeCalculation: FeeCalculationResult = {
  subtotal: 30,
  discounts: [],
  taxes: 0,
  total: 30,
  breakdown: [],
};
const rates = { percent: 7, flatCents: 0, minCents: 0 };
const secretaryTotals = computePaymentTotals({
  paymentMethod: 'secretary_paid',
  feeCalculation,
  capacityReady: true,
  rates,
});
const headline = (totals: ReturnType<typeof computePaymentTotals>) =>
  formatAmountDue({ capacityReady: true, totals, entryFeeCents: 3000, classCount: 1 });

describe('the desk total names what to collect (MYK9-2149)', () => {
  it('quotes nothing due, not "$30.00 (Received)", when the form covers the entry', () => {
    const totals = withDeskCollect(secretaryTotals, { kind: 'covered', heldCents: 4000 });

    expect(totals).toMatchObject({
      amountDueCents: 0,
      formCoveredCents: 3000,
      isSecretaryReceived: false,
    });
    expect(headline(totals)).toBe('$0.00 (Already covered)');
  });

  it('quotes only the difference received when the form covers part of the entry', () => {
    const totals = withDeskCollect(secretaryTotals, {
      kind: 'partial',
      collectCents: 2000,
      heldCents: 1000,
    });

    expect(totals).toMatchObject({ amountDueCents: 2000, formCoveredCents: 1000 });
    expect(headline(totals)).toBe('$20.00 (Received)');
  });

  it('is unchanged when the form holds nothing extra', () => {
    const totals = withDeskCollect(secretaryTotals, { kind: 'unchanged' });

    expect(totals).toBe(secretaryTotals);
    expect(headline(totals)).toBe('$30.00 (Received)');
  });
});
