import { describe, it, expect } from 'vitest';
import { calculatePlatformFeeCents, resolvePlatformFeePercent } from './platformFee';

describe('calculatePlatformFeeCents', () => {
  it('computes 3% of the subtotal in cents', () => {
    expect(calculatePlatformFeeCents(10000, 3)).toBe(300);
  });

  it('rounds to the nearest cent', () => {
    // 3333 * 3% = 99.99 → 100
    expect(calculatePlatformFeeCents(3333, 3)).toBe(100);
    // 3316 * 3% = 99.48 → 99
    expect(calculatePlatformFeeCents(3316, 3)).toBe(99);
  });

  it('returns 0 for zero or negative subtotals', () => {
    expect(calculatePlatformFeeCents(0, 3)).toBe(0);
    expect(calculatePlatformFeeCents(-100, 3)).toBe(0);
  });

  it('returns 0 when the fee percent is zero or negative', () => {
    expect(calculatePlatformFeeCents(10000, 0)).toBe(0);
    expect(calculatePlatformFeeCents(10000, -3)).toBe(0);
  });
});

describe('resolvePlatformFeePercent', () => {
  it('parses a valid percent from the env value', () => {
    expect(resolvePlatformFeePercent('5')).toBe(5);
    expect(resolvePlatformFeePercent('2.5')).toBe(2.5);
  });

  it('allows an explicit zero (fee disabled on purpose)', () => {
    expect(resolvePlatformFeePercent('0')).toBe(0);
  });

  it('falls back to 3 when unset', () => {
    expect(resolvePlatformFeePercent(undefined)).toBe(3);
  });

  it('falls back to 3 for empty or whitespace values (a blank secret must not silently disable the fee)', () => {
    expect(resolvePlatformFeePercent('')).toBe(3);
    expect(resolvePlatformFeePercent('   ')).toBe(3);
  });

  it('falls back to 3 for garbage or out-of-range values', () => {
    expect(resolvePlatformFeePercent('abc')).toBe(3);
    expect(resolvePlatformFeePercent('-1')).toBe(3);
    expect(resolvePlatformFeePercent('21')).toBe(3);
    expect(resolvePlatformFeePercent('Infinity')).toBe(3);
  });
});
