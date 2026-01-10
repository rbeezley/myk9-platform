import { describe, it, expect } from 'vitest';
import { formatDateMMDDYYYY, formatDayAbbreviation } from '@/utils/dateFormat';

describe('formatDate utilities', () => {
  describe('formatDateMMDDYYYY', () => {
    it('should format valid ISO date string to MM/DD/YYYY', () => {
      expect(formatDateMMDDYYYY('2024-01-15')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('2024-12-31')).toBe('12/31/2024');
      expect(formatDateMMDDYYYY('2023-07-04')).toBe('07/04/2023');
    });

    it('should handle different date string formats', () => {
      // Standard formats
      expect(formatDateMMDDYYYY('2024-01-15T10:30:00Z')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('2024-01-15T10:30:00.000Z')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('January 15, 2024')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('Jan 15, 2024')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('01/15/2024')).toBe('01/15/2024');
    });

    it('should pad single-digit months and days with zeros', () => {
      expect(formatDateMMDDYYYY('2024-01-01')).toBe('01/01/2024');
      expect(formatDateMMDDYYYY('2024-01-09')).toBe('01/09/2024');
      expect(formatDateMMDDYYYY('2024-09-01')).toBe('09/01/2024');
    });

    it('should handle leap years correctly', () => {
      expect(formatDateMMDDYYYY('2024-02-29')).toBe('02/29/2024'); // 2024 is a leap year
      expect(formatDateMMDDYYYY('2020-02-29')).toBe('02/29/2020'); // 2020 is a leap year
    });

    it('should return "N/A" for invalid date strings', () => {
      expect(formatDateMMDDYYYY('invalid-date')).toBe('N/A');
      expect(formatDateMMDDYYYY('2024-13-01')).toBe('N/A'); // Invalid month
      expect(formatDateMMDDYYYY('2024-02-30')).toBe('N/A'); // Invalid day for February
      expect(formatDateMMDDYYYY('not-a-date')).toBe('N/A');
      expect(formatDateMMDDYYYY('')).toBe('N/A');
    });

    it('should return "N/A" for undefined or null input', () => {
      expect(formatDateMMDDYYYY(undefined)).toBe('N/A');
      expect(formatDateMMDDYYYY(null as unknown as string)).toBe('N/A');
    });

    it('should handle edge case dates', () => {
      // Year boundaries
      expect(formatDateMMDDYYYY('1999-12-31')).toBe('12/31/1999');
      expect(formatDateMMDDYYYY('2000-01-01')).toBe('01/01/2000');
      
      // Month boundaries
      expect(formatDateMMDDYYYY('2024-01-31')).toBe('01/31/2024');
      expect(formatDateMMDDYYYY('2024-02-01')).toBe('02/01/2024');
      
      // Very old and future dates
      expect(formatDateMMDDYYYY('1900-01-01')).toBe('01/01/1900');
      expect(formatDateMMDDYYYY('2100-12-31')).toBe('12/31/2100');
    });

    it('should handle Date objects passed as strings', () => {
      const date = new Date('2024-01-15');
      expect(formatDateMMDDYYYY(date.toISOString())).toBe('01/15/2024');
    });

    it('should be consistent across different timezones for date-only strings', () => {
      // Date-only strings should be parsed consistently
      expect(formatDateMMDDYYYY('2024-01-15')).toBe('01/15/2024');
      expect(formatDateMMDDYYYY('2024-06-30')).toBe('06/30/2024');
    });
  });

  describe('formatDayAbbreviation', () => {
    it('should format valid dates to abbreviated day names', () => {
      // January 15, 2024 is a Monday
      expect(formatDayAbbreviation('2024-01-15')).toBe('Mon');
      // January 16, 2024 is a Tuesday
      expect(formatDayAbbreviation('2024-01-16')).toBe('Tue');
      // January 17, 2024 is a Wednesday
      expect(formatDayAbbreviation('2024-01-17')).toBe('Wed');
      // January 18, 2024 is a Thursday
      expect(formatDayAbbreviation('2024-01-18')).toBe('Thu');
      // January 19, 2024 is a Friday
      expect(formatDayAbbreviation('2024-01-19')).toBe('Fri');
      // January 20, 2024 is a Saturday
      expect(formatDayAbbreviation('2024-01-20')).toBe('Sat');
      // January 21, 2024 is a Sunday
      expect(formatDayAbbreviation('2024-01-21')).toBe('Sun');
    });

    it('should handle different date string formats', () => {
      // Standard formats
      expect(formatDayAbbreviation('2024-01-15T10:30:00Z')).toBe('Mon');
      expect(formatDayAbbreviation('2024-01-15T10:30:00.000Z')).toBe('Mon');
      expect(formatDayAbbreviation('January 15, 2024')).toBe('Mon');
      expect(formatDayAbbreviation('Jan 15, 2024')).toBe('Mon');
      expect(formatDayAbbreviation('01/15/2024')).toBe('Mon');
    });

    it('should return empty string for invalid date strings', () => {
      expect(formatDayAbbreviation('invalid-date')).toBe('');
      expect(formatDayAbbreviation('2024-13-01')).toBe(''); // Invalid month
      expect(formatDayAbbreviation('2024-02-30')).toBe(''); // Invalid day for February
      expect(formatDayAbbreviation('not-a-date')).toBe('');
      expect(formatDayAbbreviation('')).toBe('');
    });

    it('should return empty string for undefined or null input', () => {
      expect(formatDayAbbreviation(undefined)).toBe('');
      expect(formatDayAbbreviation(null as unknown as string)).toBe('');
    });

    it('should handle edge case dates', () => {
      // Year 2000 (leap year) - January 1, 2000 was a Saturday
      expect(formatDayAbbreviation('2000-01-01')).toBe('Sat');
      
      // Leap day
      expect(formatDayAbbreviation('2024-02-29')).toBe('Thu');
      
      // Very old dates
      expect(formatDayAbbreviation('1900-01-01')).toBe('Mon');
      
      // Future dates
      expect(formatDayAbbreviation('2030-01-01')).toBe('Tue');
    });

    it('should be consistent with different time components', () => {
      // Same date with different times should return same day
      expect(formatDayAbbreviation('2024-01-15T00:00:00Z')).toBe('Mon');
      expect(formatDayAbbreviation('2024-01-15T12:00:00Z')).toBe('Mon');
      expect(formatDayAbbreviation('2024-01-15T23:59:59Z')).toBe('Mon');
    });

    it('should handle all days of the week correctly', () => {
      // Test a full week
      const weekDates = [
        '2024-01-21', // Sunday
        '2024-01-22', // Monday
        '2024-01-23', // Tuesday
        '2024-01-24', // Wednesday
        '2024-01-25', // Thursday
        '2024-01-26', // Friday
        '2024-01-27', // Saturday
      ];
      
      const expectedDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      weekDates.forEach((date, index) => {
        expect(formatDayAbbreviation(date)).toBe(expectedDays[index]);
      });
    });
  });

  describe('Integration tests', () => {
    it('should work together for the same date', () => {
      const testDate = '2024-01-15';
      
      expect(formatDateMMDDYYYY(testDate)).toBe('01/15/2024');
      expect(formatDayAbbreviation(testDate)).toBe('Mon');
    });

    it('should handle invalid dates consistently', () => {
      const invalidDate = 'invalid-date';
      
      expect(formatDateMMDDYYYY(invalidDate)).toBe('N/A');
      expect(formatDayAbbreviation(invalidDate)).toBe('');
    });

    it('should handle undefined input consistently', () => {
      expect(formatDateMMDDYYYY(undefined)).toBe('N/A');
      expect(formatDayAbbreviation(undefined)).toBe('');
    });
  });

  describe('Performance considerations', () => {
    it('should handle multiple calls efficiently', () => {
      const testDates = [
        '2024-01-01',
        '2024-06-15',
        '2024-12-31',
        '2023-02-28',
        '2024-02-29',
      ];
      
      // Multiple calls should not throw errors or have performance issues
      testDates.forEach(date => {
        expect(formatDateMMDDYYYY(date)).toBeDefined();
        expect(formatDayAbbreviation(date)).toBeDefined();
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
      formatDayAbbreviation('2024-01-15');
      
      expect(Date.prototype.getMonth).toBe(originalDateMethods.getMonth);
      expect(Date.prototype.getDate).toBe(originalDateMethods.getDate);
      expect(Date.prototype.getFullYear).toBe(originalDateMethods.getFullYear);
      expect(Date.prototype.toLocaleDateString).toBe(originalDateMethods.toLocaleDateString);
    });
  });
});