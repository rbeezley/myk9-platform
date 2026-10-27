import { describe, it, expect } from 'vitest';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

describe('formatDate utilities', () => {
  describe('formatDateMMDDYYYY', () => {
    it('should format valid ISO date string to MM/DD/YYYY', () => {
      expect(formatDateMMDDYYYY('2024-01-15')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('2024-12-31')).toBe('12/31/2024');
      expect(formatDateMMDDYYYY('2023-07-04')).toBe('7/4/2023');
    });

    it('should handle different date string formats', () => {
      // Standard formats - these fall through to Date constructor, no zero-padding
      expect(formatDateMMDDYYYY('2024-01-15T10:30:00Z')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('2024-01-15T10:30:00.000Z')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('January 15, 2024')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('Jan 15, 2024')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('01/15/2024')).toBe('1/15/2024');
    });

    it('should format single-digit months and days without zero padding', () => {
      expect(formatDateMMDDYYYY('2024-01-01')).toBe('1/1/2024');
      expect(formatDateMMDDYYYY('2024-01-09')).toBe('1/9/2024');
      expect(formatDateMMDDYYYY('2024-09-01')).toBe('9/1/2024');
    });

    it('should handle leap years correctly', () => {
      expect(formatDateMMDDYYYY('2024-02-29')).toBe('2/29/2024'); // 2024 is a leap year
      expect(formatDateMMDDYYYY('2020-02-29')).toBe('2/29/2020'); // 2020 is a leap year
    });

    it('should return empty string for truly invalid date strings', () => {
      expect(formatDateMMDDYYYY('invalid-date')).toBe('');
      expect(formatDateMMDDYYYY('not-a-date')).toBe('');
      expect(formatDateMMDDYYYY('')).toBe('');
    });

    it('should not validate month/day ranges for YYYY-MM-DD format', () => {
      // The implementation uses string manipulation for YYYY-MM-DD format
      // and does not validate that month/day values are in valid ranges
      expect(formatDateMMDDYYYY('2024-13-01')).toBe('13/1/2024');
      expect(formatDateMMDDYYYY('2024-02-30')).toBe('2/30/2024');
    });

    it('should return empty string for undefined or null input', () => {
      expect(formatDateMMDDYYYY(undefined)).toBe('');
      expect(formatDateMMDDYYYY(null as unknown as string)).toBe('');
    });

    it('should handle edge case dates', () => {
      // Year boundaries
      expect(formatDateMMDDYYYY('1999-12-31')).toBe('12/31/1999');
      expect(formatDateMMDDYYYY('2000-01-01')).toBe('1/1/2000');

      // Month boundaries
      expect(formatDateMMDDYYYY('2024-01-31')).toBe('1/31/2024');
      expect(formatDateMMDDYYYY('2024-02-01')).toBe('2/1/2024');

      // Very old and future dates
      expect(formatDateMMDDYYYY('1900-01-01')).toBe('1/1/1900');
      expect(formatDateMMDDYYYY('2100-12-31')).toBe('12/31/2100');
    });

    it('should handle Date objects passed as strings', () => {
      // MYK9-384: this asserted '01/15/2024' when it was written (35c3a1d4b) and
      // was later weakened to compute the expected value from LOCAL time, which
      // pinned the very shift this helper now fixes: a DATE column round-trips as
      // '2024-01-15T00:00:00.000Z', and reading that as an instant renders Jan 14
      // for every viewer west of UTC. The calendar day written in the string is
      // the intended one, so the original expectation is restored.
      const date = new Date('2024-01-15');
      expect(formatDateMMDDYYYY(date.toISOString())).toBe('1/15/2024');
    });

    it('should be consistent across different timezones for date-only strings', () => {
      // Date-only strings should be parsed consistently
      expect(formatDateMMDDYYYY('2024-01-15')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('2024-06-30')).toBe('6/30/2024');
    });
  });

  describe('Performance considerations', () => {
    it('should handle multiple calls efficiently', () => {
      const testDates = ['2024-01-01', '2024-06-15', '2024-12-31', '2023-02-28', '2024-02-29'];

      // Multiple calls should not throw errors or have performance issues
      testDates.forEach(date => {
        expect(formatDateMMDDYYYY(date)).toBeDefined();
      });
    });

    it('should not modify global Date prototype', () => {
      const originalDateMethods = {
        getMonth: Date.prototype.getMonth,
        getDate: Date.prototype.getDate,
        getFullYear: Date.prototype.getFullYear,
        toLocaleDateString: Date.prototype.toLocaleDateString,
      };

      formatDateMMDDYYYY('2024-01-15');

      expect(Date.prototype.getMonth).toBe(originalDateMethods.getMonth);
      expect(Date.prototype.getDate).toBe(originalDateMethods.getDate);
      expect(Date.prototype.getFullYear).toBe(originalDateMethods.getFullYear);
      expect(Date.prototype.toLocaleDateString).toBe(originalDateMethods.toLocaleDateString);
    });
  });
});
