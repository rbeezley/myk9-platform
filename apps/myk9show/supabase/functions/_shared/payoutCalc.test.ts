import { describe, it, expect } from 'vitest';
import { calculateShowPayoutCents } from './payoutCalc';

const online = (fee: number, status = 'paid', refund: number | null = null) => ({
  entry_fee: fee,
  payment_method: 'online' as string | null,
  payment_status: status as string | null,
  refund_amount: refund,
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
        { entry_fee: 30, payment_method: 'cash', payment_status: 'paid', refund_amount: null },
        { entry_fee: 30, payment_method: 'check', payment_status: 'paid', refund_amount: null },
        { entry_fee: 30, payment_method: 'waived', payment_status: 'paid', refund_amount: null },
        {
          entry_fee: 30,
          payment_method: 'secretary_paid',
          payment_status: 'paid',
          refund_amount: null,
        },
        { entry_fee: 30, payment_method: null, payment_status: 'paid', refund_amount: null },
      ])
    ).toBe(5000);
  });

  it('PARTIAL refund pays the club the unrefunded remainder, not zero', () => {
    // $30 entry, $5 refunded → club gets $25 (PR #625 review finding: flipping
    // payment_status to refunded must not drop the whole fee).
    expect(calculateShowPayoutCents([online(30, 'refunded', 5)])).toBe(2500);
  });

  it('FULL refund contributes exactly zero', () => {
    expect(calculateShowPayoutCents([online(30, 'refunded', 30)])).toBe(0);
  });

  it("a forged 'refunded' status WITHOUT a guarded refund_amount still pays the full fee", () => {
    // refund_amount is service-role-only (write-guard trigger); payment_status
    // is not. Keying the deduction on refund_amount means a direct PostgREST
    // status flip cannot silently shrink the club's payout (SA-001).
    expect(calculateShowPayoutCents([online(30, 'refunded', null)])).toBe(3000);
  });

  it('over-refund clamps to zero, never negative', () => {
    expect(calculateShowPayoutCents([online(30, 'refunded', 31)])).toBe(0);
  });

  it('excludes pending entries — never paid, nothing to transfer', () => {
    expect(calculateShowPayoutCents([online(50), online(40, 'pending')])).toBe(5000);
  });

  it('returns 0 for empty lists and null fees', () => {
    expect(calculateShowPayoutCents([])).toBe(0);
    expect(
      calculateShowPayoutCents([
        { entry_fee: null, payment_method: 'online', payment_status: 'paid', refund_amount: null },
      ])
    ).toBe(0);
  });
});
