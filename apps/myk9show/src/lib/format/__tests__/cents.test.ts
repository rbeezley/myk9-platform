import { formatCents, formatDeductionCents } from '../cents';

describe('formatCents', () => {
  it('shows whole and fractional dollars with two places', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(12345)).toBe('$123.45');
    expect(formatCents(100000)).toBe('$1000.00');
  });
});

describe('formatDeductionCents', () => {
  it('signs a deduction and shows none as zero', () => {
    expect(formatDeductionCents(500)).toBe('-$5.00');
    expect(formatDeductionCents(0)).toBe('$0.00');
  });
});
