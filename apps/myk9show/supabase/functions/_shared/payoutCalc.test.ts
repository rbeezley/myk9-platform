import { describe, it, expect } from 'vitest';
import { calculateShowPayoutCents } from './payoutCalc';

const online = (fee: number, status = 'paid') => ({
  entry_fee: fee,
  payment_method: 'online' as string | null,
  payment_status: status as string | null,
});

describe('calculateShowPayoutCents', () => {
  it('sums online paid entries in cents (entries store DECIMAL dollars)', () => {
    expect(calculateShowPayoutCents([online(50), online(45.33)])).toBe(9533);
  });

  it('rounds per entry, not on the float total', () => {
    // 3 × $45.33 = $135.99; per-entry rounding gives exactly 13599 even when
    // the float dollar total (135.98999...) would round-trip dirty.
    expect(calculateShowPayoutCents([online(45.33), online(45.33), online(45.33)])).toBe(13599);
  });

  it('excludes desk payments — cash, check, waived, secretary_paid, and legacy NULL', () => {
    expect(
      calculateShowPayoutCents([
        online(50),
        { entry_fee: 30, payment_method: 'cash', payment_status: 'paid' },
        { entry_fee: 30, payment_method: 'check', payment_status: 'paid' },
        { entry_fee: 30, payment_method: 'waived', payment_status: 'paid' },
        { entry_fee: 30, payment_method: 'secretary_paid', payment_status: 'paid' },
        { entry_fee: 30, payment_method: null, payment_status: 'paid' },
      ])
    ).toBe(5000);
  });

  it('excludes refunded and pending entries — the club is never paid for refunded money', () => {
    expect(
      calculateShowPayoutCents([online(50), online(40, 'refunded'), online(40, 'pending')])
    ).toBe(5000);
  });

  it('returns 0 for empty lists and null fees', () => {
    expect(calculateShowPayoutCents([])).toBe(0);
    expect(
      calculateShowPayoutCents([
        { entry_fee: null, payment_method: 'online', payment_status: 'paid' },
      ])
    ).toBe(0);
  });
});
