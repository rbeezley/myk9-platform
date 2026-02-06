import { describe, it, expect } from 'vitest';
import {
  formatDateDisplay,
  formatDateMMDDYYYY,
  formatDateLocal,
  toYYYYMMDD,
  parseLocalDateString,
  getTodayLocal,
  isValidDateFormat,
  dateDifferenceInDays,
  formatTrialDate,
} from './dateFormatting';

describe('formatDateDisplay', () => {
  it('should format YYYY-MM-DD to M/D/YYYY', () => {
    expect(formatDateDisplay('2024-01-15')).toBe('1/15/2024');
  });

  it('should return empty string for empty input', () => {
    expect(formatDateDisplay('')).toBe('');
  });

  it('should return original string for non-date format', () => {
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date');
  });

  it('should strip leading zeros from month and day', () => {
    expect(formatDateDisplay('2024-01-05')).toBe('1/5/2024');
  });

  it('should handle double-digit month and day', () => {
    expect(formatDateDisplay('2024-12-25')).toBe('12/25/2024');
  });

  it('should return original for invalid number parts', () => {
    expect(formatDateDisplay('abcd-ef-gh')).toBe('abcd-ef-gh');
  });
});

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
