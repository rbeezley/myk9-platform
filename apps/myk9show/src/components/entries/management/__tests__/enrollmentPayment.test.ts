import { describe, it, expect } from 'vitest';
import { balanceAfterPayment, resolvePartialPayment } from '../enrollmentPayment';

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
