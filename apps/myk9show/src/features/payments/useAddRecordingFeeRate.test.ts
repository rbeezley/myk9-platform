import { describe, expect, it } from 'vitest';
import { isPlausibleRecordingFeeDate, parseRecordingFeeDollars } from './useAddRecordingFeeRate';

describe('parseRecordingFeeDollars', () => {
  it.each([
    ['5.50', 550],
    ['5', 500],
    ['4.35', 435],
    ['0.01', 1],
    ['1000', 100_000],
  ])('reads "%s" as %s cents', (value, cents) => {
    expect(parseRecordingFeeDollars(value)).toBe(cents);
  });

  it.each(['', '0', '0.00', '0.0', '5.555', '-1', 'abc', '1000.01', '10001'])(
    'refuses "%s" (a fee is never free, never fractional cents, never over $1,000)',
    value => {
      expect(parseRecordingFeeDollars(value)).toBeNull();
    }
  );
});

describe('isPlausibleRecordingFeeDate', () => {
  it.each(['2020-01-01', '2027-01-01', '2100-12-31'])('accepts %s', value => {
    expect(isPlausibleRecordingFeeDate(value)).toBe(true);
  });

  it.each(['2019-12-31', '2101-01-01', '0202-01-01', '2027-02-30', '', '1/1/2027'])(
    'refuses %s',
    value => {
      expect(isPlausibleRecordingFeeDate(value)).toBe(false);
    }
  );
});
