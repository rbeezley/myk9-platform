import { describe, expect, it } from 'vitest';
import { formatTimeLimitSeconds, parseTimeLimitSeconds } from './classTimeLimits';

// MYK9-1503: the class editor's limits read and write through the shared
// duration rules, so what the field shows is what reaches the column.
describe('class time limits', () => {
  it.each([
    ['5:00', 300],
    ['05:00', 300],
    ['4:30', 270],
    ['15:00', 900],
    [' 2:05 ', 125],
  ])('reads %j as %i seconds', (text, seconds) => {
    expect(parseTimeLimitSeconds(text)).toBe(seconds);
  });

  it.each(['', '0:00', 'abc', '4:75'])('clears the limit for %j', text => {
    expect(parseTimeLimitSeconds(text)).toBeNull();
  });

  it('writes the shared field format and round-trips', () => {
    expect(formatTimeLimitSeconds(300)).toBe('5:00');
    expect(formatTimeLimitSeconds(65)).toBe('1:05');
    expect(formatTimeLimitSeconds(null)).toBe('');
    for (const seconds of [1, 59, 60, 270, 599, 900]) {
      expect(parseTimeLimitSeconds(formatTimeLimitSeconds(seconds))).toBe(seconds);
    }
  });
});
