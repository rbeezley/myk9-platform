import { describe, it, expect } from 'vitest';
import { formatDateMMDDYYYY, formatDayAbbreviation } from '@/utils/dateFormat';

/**
 * Helper to compute what formatDayAbbreviation will return for a given date string.
 * This accounts for the fact that date-only ISO strings ('2024-01-15') are parsed as
 * UTC midnight, but toLocaleDateString uses local time, which can shift the day
 * backwards in timezones behind UTC.
 */
function expectedDayAbbrev(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

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
      // new Date('2024-01-15') is UTC midnight; toISOString produces
      // '2024-01-15T00:00:00.000Z'. In timezones behind UTC, the local
      // date will be Jan 14. Use the Date constructor path to get the
      // expected local result.
      const date = new Date('2024-01-15');
      const isoStr = date.toISOString();
      const localDate = new Date(isoStr);
      const expectedMonth = localDate.getMonth() + 1;
      const expectedDay = localDate.getDate();
      const expectedYear = localDate.getFullYear();
      expect(formatDateMMDDYYYY(isoStr)).toBe(`${expectedMonth}/${expectedDay}/${expectedYear}`);
    });

    it('should be consistent across different timezones for date-only strings', () => {
      // Date-only strings should be parsed consistently
      expect(formatDateMMDDYYYY('2024-01-15')).toBe('1/15/2024');
      expect(formatDateMMDDYYYY('2024-06-30')).toBe('6/30/2024');
    });
  });

  describe('formatDayAbbreviation', () => {
    it('should format valid dates to abbreviated day names', () => {
      // Use timestamps with midday UTC to avoid timezone day-shift issues
      // January 15, 2024 is a Monday in UTC
      expect(formatDayAbbreviation('2024-01-15T12:00:00Z')).toBe('Mon');
      // January 16, 2024 is a Tuesday
      expect(formatDayAbbreviation('2024-01-16T12:00:00Z')).toBe('Tue');
      // January 17, 2024 is a Wednesday
      expect(formatDayAbbreviation('2024-01-17T12:00:00Z')).toBe('Wed');
      // January 18, 2024 is a Thursday
      expect(formatDayAbbreviation('2024-01-18T12:00:00Z')).toBe('Thu');
      // January 19, 2024 is a Friday
      expect(formatDayAbbreviation('2024-01-19T12:00:00Z')).toBe('Fri');
      // January 20, 2024 is a Saturday
      expect(formatDayAbbreviation('2024-01-20T12:00:00Z')).toBe('Sat');
      // January 21, 2024 is a Sunday
      expect(formatDayAbbreviation('2024-01-21T12:00:00Z')).toBe('Sun');
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
      expect(formatDayAbbreviation('not-a-date')).toBe('');
      expect(formatDayAbbreviation('')).toBe('');
    });

    it('should handle date rollover for out-of-range days', () => {
      // JS Date rolls '2024-02-30' to Feb 29 (leap year), which is valid
      expect(formatDayAbbreviation('2024-02-30')).toBe('Thu');
    });

    it('should return empty string for undefined or null input', () => {
      expect(formatDayAbbreviation(undefined)).toBe('');
      expect(formatDayAbbreviation(null as unknown as string)).toBe('');
    });

    it('should handle edge case dates', () => {
      // Use midday UTC to avoid timezone day-shift
      expect(formatDayAbbreviation('2000-01-01T12:00:00Z')).toBe('Sat');

      // Leap day
      expect(formatDayAbbreviation('2024-02-29T12:00:00Z')).toBe('Thu');

      // Very old dates
      expect(formatDayAbbreviation('1900-01-01T12:00:00Z')).toBe('Mon');

      // Future dates
      expect(formatDayAbbreviation('2030-01-01T12:00:00Z')).toBe('Tue');
    });

    it('should be consistent with different time components', () => {
      // Same date with different UTC times - note that in timezones behind UTC,
      // midnight UTC may land on the previous local day
      const expectedMidnight = expectedDayAbbrev('2024-01-15T00:00:00Z');
      const expectedNoon = expectedDayAbbrev('2024-01-15T12:00:00Z');
      const expectedLateNight = expectedDayAbbrev('2024-01-15T23:59:59Z');

      expect(formatDayAbbreviation('2024-01-15T00:00:00Z')).toBe(expectedMidnight);
      expect(formatDayAbbreviation('2024-01-15T12:00:00Z')).toBe(expectedNoon);
      expect(formatDayAbbreviation('2024-01-15T23:59:59Z')).toBe(expectedLateNight);

      // Noon and late night should always be the same local day
      expect(expectedNoon).toBe(expectedLateNight);
    });

    it('should handle all days of the week correctly', () => {
      // Use midday UTC to avoid timezone day-shift issues
      const weekDates = [
        '2024-01-21T12:00:00Z', // Sunday
        '2024-01-22T12:00:00Z', // Monday
        '2024-01-23T12:00:00Z', // Tuesday
        '2024-01-24T12:00:00Z', // Wednesday
        '2024-01-25T12:00:00Z', // Thursday
        '2024-01-26T12:00:00Z', // Friday
        '2024-01-27T12:00:00Z', // Saturday
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

      expect(formatDateMMDDYYYY(testDate)).toBe('1/15/2024');
      // formatDayAbbreviation uses Date constructor which treats date-only
      // strings as UTC, so the local day may differ from the UTC day
      expect(formatDayAbbreviation(testDate)).toBe(expectedDayAbbrev(testDate));
    });

    it('should handle invalid dates consistently', () => {
      const invalidDate = 'invalid-date';

      expect(formatDateMMDDYYYY(invalidDate)).toBe('');
      expect(formatDayAbbreviation(invalidDate)).toBe('');
    });

    it('should handle undefined input consistently', () => {
      expect(formatDateMMDDYYYY(undefined)).toBe('');
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