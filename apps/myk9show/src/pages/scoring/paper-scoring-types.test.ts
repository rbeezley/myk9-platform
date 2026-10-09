import { describe, it, expect } from 'vitest';
import { digitsToSeconds, overTimeLimitWarning } from './paper-scoring-types';

describe('digitsToSeconds', () => {
  it('reads MMSShh digits', () => {
    expect(digitsToSeconds('12345')).toBeCloseTo(83.45);
    expect(digitsToSeconds('4520')).toBeCloseTo(45.2);
    expect(digitsToSeconds('')).toBe(0);
  });

  it('reads a formatted time the same as its digits', () => {
    expect(digitsToSeconds('0:45.20')).toBeCloseTo(45.2);
    expect(digitsToSeconds('2:05.10')).toBeCloseTo(125.1);
  });
});

describe('overTimeLimitWarning', () => {
  it('flags a Q over the limit and names the limit', () => {
    expect(overTimeLimitWarning('Q', '30001', 180)).toMatch(/3:00/);
  });
  it('passes a Q at the limit', () => {
    expect(overTimeLimitWarning('Q', '30000', 180)).toBeNull();
  });
  it('ignores non-Q results and unknown limits', () => {
    expect(overTimeLimitWarning('NQ', '99999', 180)).toBeNull();
    expect(overTimeLimitWarning('Q', '99999', undefined)).toBeNull();
  });
});
