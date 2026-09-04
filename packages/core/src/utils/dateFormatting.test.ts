import { describe, it, expect } from 'vitest';
import {
  formatDateMMDDYYYY,
  formatDateLocal,
  toYYYYMMDD,
  parseLocalDateString,
  getTodayLocal,
  isValidDateFormat,
  dateDifferenceInDays,
  formatTrialDate,
  formatDayAbbreviation,
  formatTime,
} from './dateFormatting';

describe('formatDateMMDDYYYY', () => {
  it('should format YYYY-MM-DD string', () => {
    expect(formatDateMMDDYYYY('2024-01-05')).toBe('1/5/2024');
  });

  it('should return empty string for undefined', () => {
    expect(formatDateMMDDYYYY(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(formatDateMMDDYYYY('')).toBe('');
  });

  it('should handle non-YYYY-MM-DD formats by parsing as Date', () => {
    // This will parse through new Date(), result depends on locale
    const result = formatDateMMDDYYYY('January 15, 2024');
    expect(result).toContain('2024');
  });

  it('should return empty string for unparseable date', () => {
    expect(formatDateMMDDYYYY('not a date at all')).toBe('');
  });
});

describe('formatDateLocal', () => {
  it('should format Date to YYYY-MM-DD', () => {
    const date = new Date(2024, 0, 15); // Jan 15, 2024
    expect(formatDateLocal(date)).toBe('2024-01-15');
  });

  it('should zero-pad month and day', () => {
    const date = new Date(2024, 2, 5); // Mar 5, 2024
    expect(formatDateLocal(date)).toBe('2024-03-05');
  });

  it('should handle December correctly', () => {
    const date = new Date(2024, 11, 25); // Dec 25, 2024
    expect(formatDateLocal(date)).toBe('2024-12-25');
  });

  it('should return empty string for invalid Date', () => {
    expect(formatDateLocal(new Date('invalid'))).toBe('');
  });
});

describe('toYYYYMMDD', () => {
  it('should pass through YYYY-MM-DD strings', () => {
    expect(toYYYYMMDD('2024-01-15')).toBe('2024-01-15');
  });

  it('should extract date from ISO format', () => {
    expect(toYYYYMMDD('2024-01-15T12:30:00Z')).toBe('2024-01-15');
  });

  it('should format Date object', () => {
    const date = new Date(2024, 0, 15);
    expect(toYYYYMMDD(date)).toBe('2024-01-15');
  });

  it('should return empty string for empty string', () => {
    expect(toYYYYMMDD('')).toBe('');
  });

  it('should return empty string for invalid date string', () => {
    expect(toYYYYMMDD('not a date')).toBe('');
  });
});

describe('parseLocalDateString', () => {
  it('should parse YYYY-MM-DD to Date', () => {
    const result = parseLocalDateString('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
    expect(result!.getMonth()).toBe(0); // January = 0
    expect(result!.getDate()).toBe(15);
  });

  it('should return undefined for empty string', () => {
    expect(parseLocalDateString('')).toBeUndefined();
  });

  it('should return undefined for invalid format', () => {
    expect(parseLocalDateString('01/15/2024')).toBeUndefined();
  });

  it('should return undefined for year out of range', () => {
    expect(parseLocalDateString('1800-01-01')).toBeUndefined();
  });

  it('should return undefined for year over 2100', () => {
    expect(parseLocalDateString('2200-01-01')).toBeUndefined();
  });

  it('should return undefined for month out of range', () => {
    expect(parseLocalDateString('2024-13-01')).toBeUndefined();
  });

  it('should return undefined for day out of range', () => {
    expect(parseLocalDateString('2024-01-32')).toBeUndefined();
  });

  it('should return undefined for day 0', () => {
    expect(parseLocalDateString('2024-01-00')).toBeUndefined();
  });

  it('should accept boundary year 1900', () => {
    const result = parseLocalDateString('1900-01-01');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(1900);
  });

  it('should accept boundary year 2100', () => {
    const result = parseLocalDateString('2100-12-31');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2100);
  });
});

describe('getTodayLocal', () => {
  it('should return a string matching YYYY-MM-DD format', () => {
    const result = getTodayLocal();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return today date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getTodayLocal()).toBe(expected);
  });
});

describe('isValidDateFormat', () => {
  it('should return true for valid YYYY-MM-DD', () => {
    expect(isValidDateFormat('2024-01-15')).toBe(true);
  });

  it('should return false for empty string', () => {
    expect(isValidDateFormat('')).toBe(false);
  });

  it('should return false for MM/DD/YYYY format', () => {
    expect(isValidDateFormat('01/15/2024')).toBe(false);
  });

  it('should return false for invalid month', () => {
    expect(isValidDateFormat('2024-13-01')).toBe(false);
  });

  it('should return false for year out of range', () => {
    expect(isValidDateFormat('1800-01-01')).toBe(false);
  });

  it('should return true for boundary dates', () => {
    expect(isValidDateFormat('1900-01-01')).toBe(true);
    expect(isValidDateFormat('2100-12-31')).toBe(true);
  });
});

describe('dateDifferenceInDays', () => {
  it('should return positive days for later end date', () => {
    expect(dateDifferenceInDays('2024-01-01', '2024-01-10')).toBe(9);
  });

  it('should return 0 for same date', () => {
    expect(dateDifferenceInDays('2024-01-15', '2024-01-15')).toBe(0);
  });

  it('should return negative for earlier end date', () => {
    expect(dateDifferenceInDays('2024-01-10', '2024-01-01')).toBe(-9);
  });

  it('should return 0 for invalid start date', () => {
    expect(dateDifferenceInDays('invalid', '2024-01-01')).toBe(0);
  });

  it('should return 0 for invalid end date', () => {
    expect(dateDifferenceInDays('2024-01-01', 'invalid')).toBe(0);
  });

  it('should handle month boundary', () => {
    expect(dateDifferenceInDays('2024-01-31', '2024-02-01')).toBe(1);
  });
});

describe('formatTrialDate', () => {
  it('should format date without trial number', () => {
    const result = formatTrialDate('2024-01-15');
    expect(result).toContain('Mon');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2024');
    expect(result).not.toContain('Trial');
  });

  it('should format date with trial number', () => {
    const result = formatTrialDate('2024-01-15', 1);
    expect(result).toContain('Trial 1');
    expect(result).toContain('•');
  });

  it('should return original for invalid format', () => {
    expect(formatTrialDate('invalid')).toBe('invalid');
  });

  it('should return original for non-numeric parts', () => {
    expect(formatTrialDate('abc-def-ghi')).toBe('abc-def-ghi');
  });

  it('should handle Dec 25, 2024', () => {
    const result = formatTrialDate('2024-12-25');
    expect(result).toContain('Wed');
    expect(result).toContain('Dec');
    expect(result).toContain('25');
  });
});

/**
 * `formatDayAbbreviation` and `formatTime` had NO tests at all — they were the
 * two uncovered functions in this file after the MYK9-328 sweep, not merely
 * partially covered ones. Both are locale-formatting wrappers, so the
 * assertions below pin the contract that matters (empty/invalid input never
 * produces "Invalid Date" in the UI) plus the parts of the output that are
 * stable across ICU versions.
 */
describe('formatDayAbbreviation', () => {
  it('returns the abbreviated weekday', () => {
    // 2024-01-15 is a Monday. Constructed via the local-date parser so the
    // assertion does not depend on the runner's timezone.
    expect(formatDayAbbreviation('2024-01-15T12:00:00')).toBe('Mon');
  });

  it('returns an empty string for undefined', () => {
    expect(formatDayAbbreviation()).toBe('');
  });

  it('returns an empty string for an empty string', () => {
    expect(formatDayAbbreviation('')).toBe('');
  });

  it('returns an empty string for an unparseable date, never "Invalid Date"', () => {
    expect(formatDayAbbreviation('not-a-date')).toBe('');
  });
});

describe('formatTime', () => {
  const at = (h: number, m: number, s = 0) => new Date(2024, 0, 15, h, m, s);

  it('formats a Date in 12-hour form by default', () => {
    const result = formatTime(at(14, 5));
    expect(result).toMatch(/^2:05/);
    expect(result).toMatch(/PM/i);
  });

  it('formats in 24-hour form when hour12 is false', () => {
    const result = formatTime(at(14, 5), { hour12: false });
    expect(result).toMatch(/^14:05/);
    expect(result).not.toMatch(/PM/i);
  });

  it('omits seconds by default and includes them on request', () => {
    expect(formatTime(at(14, 5, 9))).not.toMatch(/:09/);
    expect(formatTime(at(14, 5, 9), { includeSeconds: true })).toMatch(/:09/);
  });

  it('accepts a date string as well as a Date', () => {
    expect(formatTime('2024-01-15T14:05:00', { hour12: false })).toMatch(/^14:05/);
  });

  it('returns "Invalid Time" for an unparseable string', () => {
    expect(formatTime('not-a-date')).toBe('Invalid Time');
  });

  it('returns "Invalid Time" for an invalid Date object', () => {
    expect(formatTime(new Date(NaN))).toBe('Invalid Time');
  });
});

describe('parseLocalDateString — non-numeric parts', () => {
  // The `isNaN` guard, distinct from the range guard below it: "abcd-ef-gh"
  // splits into three parts, so it reaches parseInt and returns NaN rather
  // than being rejected on shape.
  it.each(['abcd-ef-gh', '2024-xx-15', '2024-01-yy'])('rejects %j', input => {
    expect(parseLocalDateString(input)).toBeUndefined();
  });

  it('rejects an out-of-range year without throwing', () => {
    expect(parseLocalDateString('1800-01-15')).toBeUndefined();
  });
});
