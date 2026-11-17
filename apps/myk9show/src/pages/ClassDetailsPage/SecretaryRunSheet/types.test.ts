import { describe, it, expect } from 'vitest';
import { formatSearchTime } from './types';

describe('formatSearchTime (MYK9-1225)', () => {
  it('does not truncate 61.23 to 1:01.22', () => {
    expect(formatSearchTime(61.23)).toBe('1:01.23');
  });

  it.each([
    [0, '0:00.00'],
    [5, '0:05.00'],
    [60, '1:00.00'],
    [61.25, '1:01.25'],
    [59.99, '0:59.99'],
    [95.5, '1:35.50'],
    [120, '2:00.00'],
    [600.07, '10:00.07'],
  ])('formats %s as %s', (secs, expected) => {
    expect(formatSearchTime(secs)).toBe(expected);
  });

  it('carries into the next second and minute instead of printing .100', () => {
    expect(formatSearchTime(59.995)).toBe('1:00.00');
    expect(formatSearchTime(119.999)).toBe('2:00.00');
    expect(formatSearchTime(0.999)).toBe('0:01.00');
  });
});
