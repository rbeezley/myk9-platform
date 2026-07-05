import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { getEntryPaymentPrompt } from './entryPaymentPrompt';

const pending = (paymentMethod: string | null | undefined, totalFee = 30) =>
  getEntryPaymentPrompt({ paymentMethod, paymentStatus: PaymentStatus.PENDING, totalFee });

describe('getEntryPaymentPrompt (4.C — cash/check is a status, not a debt)', () => {
  it('online card balance → the Finish Payment action', () => {
    expect(pending('online')).toEqual({ kind: 'finish-online' });
  });

  it('null/unknown method defaults to the online action (card entry pre-webhook, legacy)', () => {
    expect(pending(null)).toEqual({ kind: 'finish-online' });
    expect(pending(undefined)).toEqual({ kind: 'finish-online' });
  });

  it('cash → a calm "pay at show" status, never a debt CTA', () => {
    expect(pending('cash')).toEqual({
      kind: 'pay-at-show',
      text: 'Bring $30.00 cash to check-in',
    });
  });

  it('check → a "mail your check" status', () => {
    expect(pending('check')).toEqual({
      kind: 'pay-at-show',
      text: 'Mail your $30.00 check to the club',
    });
  });

  it.each(['secretary_paid', 'group_payment', 'waived'])(
    'staff-recorded / waived method (%s) prompts nothing to the exhibitor',
    method => {
      expect(pending(method)).toEqual({ kind: 'none' });
    }
  );

  it('never prompts once paid or with no balance', () => {
    expect(
      getEntryPaymentPrompt({
        paymentMethod: 'online',
        paymentStatus: PaymentStatus.PAID_ONLINE,
        totalFee: 30,
      })
    ).toEqual({ kind: 'none' });
    expect(pending('cash', 0)).toEqual({ kind: 'none' });
  });
});
