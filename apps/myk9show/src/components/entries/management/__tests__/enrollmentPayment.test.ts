import { describe, it, expect } from 'vitest';
import {
  balanceAfterPayment,
  netReceivedDollars,
  resolvePartialPayment,
} from '../enrollmentPayment';

describe('partial payments are THIS payment (MYK9-677)', () => {
  it('two partials, $35 then $15, are two payments of their own amounts', () => {
    // The overwrite this replaces sent paid_amount = 15 the second time,
    // erasing the $35. The server now adds each to the running total.
    const first = resolvePartialPayment('35', 'check', '1042', '2026-08-27');
    const second = resolvePartialPayment('15', 'cash', '', '2026-09-17');

    expect(first).toMatchObject({ amount: 35, method: 'check', reference: '1042' });
    expect(second).toMatchObject({ amount: 15, method: 'cash', reference: null });
  });

  it("the dialog's remaining balance subtracts what was already paid", () => {
    expect(balanceAfterPayment(50, 35, 10)).toBe(5);
    expect(balanceAfterPayment(50, 35, 15)).toBe(0);
    expect(balanceAfterPayment(50, 35, 20)).toBe(0);
  });
});

describe('netReceivedDollars (MYK9-677)', () => {
  const entries = (enrollmentRefundAmount: number | null) =>
    [{ enrollmentRefundAmount }] as unknown as Parameters<typeof netReceivedDollars>[0]['entries'];

  it('is paid minus what the enrollment already refunded', () => {
    expect(
      netReceivedDollars({ enrollmentId: 'enr-1', paidAmount: 50, entries: entries(30) })
    ).toBe(20);
  });

  it('is the paid amount when nothing was refunded', () => {
    expect(
      netReceivedDollars({ enrollmentId: 'enr-1', paidAmount: 50, entries: entries(null) })
    ).toBe(50);
  });

  it('leaves groups with no enrollment (no ledger actions) alone', () => {
    expect(netReceivedDollars({ enrollmentId: null, paidAmount: 40, entries: entries(10) })).toBe(
      40
    );
  });
});
