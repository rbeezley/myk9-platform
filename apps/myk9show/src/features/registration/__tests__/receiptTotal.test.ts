import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { receiptTotal, receiptTotalLabel } from '../receiptTotal';

describe('receiptTotal', () => {
  it('quotes the fees with the paid label for a check received', () => {
    expect(
      receiptTotal({
        paymentMethod: 'secretary_paid',
        receivedMethod: 'check',
        paymentStatus: PaymentStatus.PENDING,
        totalFees: 60,
      })
    ).toEqual({ totalFeesFormatted: '$60.00', totalLabel: 'Total · Paid by check' });
  });

  it('says Free entry for a waived entry (MYK9-1908)', () => {
    expect(
      receiptTotal({
        paymentMethod: 'waived',
        receivedMethod: undefined,
        paymentStatus: PaymentStatus.PENDING,
        totalFees: 35,
      })
    ).toEqual({ totalFeesFormatted: '$0.00 (Free entry)', totalLabel: 'Total' });
  });
});

describe('receiptTotalLabel (MYK9-2235)', () => {
  it('says paid when the secretary recorded a check or cash with the entry', () => {
    expect(receiptTotalLabel('secretary_paid', 'check')).toBe('Total · Paid by check');
    expect(receiptTotalLabel('secretary_paid', 'cash')).toBe('Total · Paid by cash');
    expect(receiptTotalLabel('secretary_paid', undefined)).toBe('Total · Paid');
  });

  it('says paid when a club or group paid', () => {
    expect(receiptTotalLabel('group_payment', undefined)).toBe('Total · Paid by a club or group');
  });

  it('says the money is due at the show for check or cash at the show', () => {
    expect(receiptTotalLabel('check', undefined)).toBe('Total · Due at the show');
    expect(receiptTotalLabel('cash', undefined)).toBe('Total · Due at the show');
  });

  it('says only Total for a free entry, money already on the form, or no method', () => {
    expect(receiptTotalLabel('waived', undefined)).toBe('Total');
    expect(receiptTotalLabel('form_money', undefined)).toBe('Total');
    expect(receiptTotalLabel(undefined, undefined)).toBe('Total');
  });

  it('never says Fees due', () => {
    const methods = [
      'credit_card',
      'check',
      'cash',
      'secretary_paid',
      'group_payment',
      'waived',
      'form_money',
    ] as const;
    for (const method of methods) {
      expect(receiptTotalLabel(method, 'check')).not.toMatch(/fees due/i);
    }
  });
});
