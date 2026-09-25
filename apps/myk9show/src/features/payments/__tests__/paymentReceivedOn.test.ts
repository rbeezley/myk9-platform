import { describe, expect, it } from 'vitest';
import { PaymentStatus } from '@/types/show-registration-types';
import { paymentReceivedOnForStatus } from '../paymentReceivedOn';

// 21:30 on 2026-09-17 in Los Angeles is already 04:30 on the 18th in UTC.
const LA_EVENING = new Date('2026-09-18T04:30:00Z');

describe('paymentReceivedOnForStatus (MYK9-677)', () => {
  it('stamps a cash payment with today in the show timezone', () => {
    expect(
      paymentReceivedOnForStatus(PaymentStatus.PAID_BY_CASH, 70, 'America/Los_Angeles', LA_EVENING)
    ).toBe('2026-09-17');
  });

  it('uses the show timezone, not UTC, across an evening midnight', () => {
    // The same instant is 00:30 on the 18th in New York: that show has
    // crossed midnight, the Los Angeles show has not.
    expect(
      paymentReceivedOnForStatus(PaymentStatus.PAID_BY_CHECK, 70, 'America/New_York', LA_EVENING)
    ).toBe('2026-09-18');
    expect(
      paymentReceivedOnForStatus(PaymentStatus.PAID_BY_CHECK, 70, 'America/Los_Angeles', LA_EVENING)
    ).toBe('2026-09-17');
  });

  it('stamps a partial amount received on account', () => {
    expect(
      paymentReceivedOnForStatus(PaymentStatus.PENDING, 20, 'America/Los_Angeles', LA_EVENING)
    ).toBe('2026-09-17');
  });

  it('clears the date when the payment is reset to due with nothing paid', () => {
    expect(
      paymentReceivedOnForStatus(PaymentStatus.PENDING, 0, 'America/Los_Angeles', LA_EVENING)
    ).toBeNull();
  });

  it('leaves the date alone for online, waived, and refund changes', () => {
    for (const status of [
      PaymentStatus.PAID_ONLINE,
      PaymentStatus.WAIVED,
      PaymentStatus.REFUNDED,
      PaymentStatus.PARTIAL_REFUND,
    ]) {
      expect(paymentReceivedOnForStatus(status, null, 'America/New_York', LA_EVENING)).toBe(
        undefined
      );
    }
  });
});
