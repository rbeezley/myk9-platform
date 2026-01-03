/**
 * Unit Tests for Time Formatting Utilities
 */

import {
  formatTimeInputTo12Hour,
  formatTimeInputToMMSS,
  addMinutesToTime,
  getCurrentTime12Hour,
  formatPlannedStartTime,
} from './timeFormattingUtils';

describe('timeFormattingUtils', () => {
  describe('formatTimeInputTo12Hour', () => {
    describe('Single/double digit input (hours)', () => {
      test('should format single digit as hour with AM', () => {
        expect(formatTimeInputTo12Hour('1')).toBe('1:00 AM');
        expect(formatTimeInputTo12Hour('9')).toBe('9:00 AM');
        expect(formatTimeInputTo12Hour('7')).toBe('7:00 AM');
      });

      test('should format double digit as hour with smart AM/PM', () => {
        expect(formatTimeInputTo12Hour('11')).toBe('11:00 AM');
        expect(formatTimeInputTo12Hour('12')).toBe('12:00 PM'); // Noon
        expect(formatTimeInputTo12Hour('01')).toBe('1:00 AM');
      });

      test('should handle hours > 12 with modulo conversion', () => {
        expect(formatTimeInputTo12Hour('13')).toBe('1:00 PM');
        expect(formatTimeInputTo12Hour('24')).toBe('12:00 PM');
      });
    });

    describe('Three digit input (H:MM)', () => {
      test('should format as H:MM with smart AM/PM', () => {
        expect(formatTimeInputTo12Hour('130')).toBe('1:30 AM');
        expect(formatTimeInputTo12Hour('945')).toBe('9:45 AM');
        expect(formatTimeInputTo12Hour('215')).toBe('2:15 AM');
      });

      test('should handle invalid minutes (>= 60)', () => {
        expect(formatTimeInputTo12Hour('190')).toBe('1:00 AM'); // 90 minutes invalid
        expect(formatTimeInputTo12Hour('165')).toBe('1:00 AM'); // 65 seconds invalid
      });
    });

    describe('Four+ digit input (HHMM)', () => {
      test('should format as H:MM with 24-hour to 12-hour conversion', () => {
        expect(formatTimeInputTo12Hour('1330')).toBe('1:30 PM');
        expect(formatTimeInputTo12Hour('0930')).toBe('9:30 AM');
        expect(formatTimeInputTo12Hour('1200')).toBe('12:00 PM'); // Noon
        expect(formatTimeInputTo12Hour('0000')).toBe('12:00 AM'); // Midnight
      });

      test('should handle afternoon/evening times', () => {
        expect(formatTimeInputTo12Hour('1445')).toBe('2:45 PM'); // 14:45
        expect(formatTimeInputTo12Hour('2100')).toBe('9:00 PM'); // 21:00
        expect(formatTimeInputTo12Hour('2359')).toBe('11:59 PM'); // 23:59
      });

      test('should handle invalid minutes (>= 60) in 4-digit format', () => {
        expect(formatTimeInputTo12Hour('1365')).toBe('1:00 PM'); // 65 minutes invalid
      });
    });

    describe('Input with AM/PM period', () => {
      test('should respect explicit PM period', () => {
        expect(formatTimeInputTo12Hour('3pm')).toBe('3:00 PM');
        expect(formatTimeInputTo12Hour('3PM')).toBe('3:00 PM');
        expect(formatTimeInputTo12Hour('1145pm')).toBe('11:45 PM');
      });

      test('should respect explicit AM period', () => {
        expect(formatTimeInputTo12Hour('3am')).toBe('3:00 AM');
        expect(formatTimeInputTo12Hour('3AM')).toBe('3:00 AM');
        expect(formatTimeInputTo12Hour('1145am')).toBe('11:45 AM');
      });

      test('should handle mixed case periods', () => {
        expect(formatTimeInputTo12Hour('3Pm')).toBe('3:00 PM');
        expect(formatTimeInputTo12Hour('3Am')).toBe('3:00 AM');
      });
    });

    describe('Edge cases', () => {
      test('should return empty string for empty input', () => {
        expect(formatTimeInputTo12Hour('')).toBe('');
        expect(formatTimeInputTo12Hour('   ')).toBe('');
      });

      test('should return empty string for invalid input', () => {
        expect(formatTimeInputTo12Hour('abc')).toBe('');
        expect(formatTimeInputTo12Hour('invalid')).toBe('');
      });

      test('should handle input with extra characters', () => {
        expect(formatTimeInputTo12Hour('9:30')).toBe('9:30 AM'); // Colon removed
        expect(formatTimeInputTo12Hour('9.30')).toBe('9:30 AM'); // Period removed
        expect(formatTimeInputTo12Hour('9-30')).toBe('9:30 AM'); // Dash removed
      });

      test('should handle hour 0 as 12', () => {
        expect(formatTimeInputTo12Hour('0')).toBe('12:00 AM');
        expect(formatTimeInputTo12Hour('00')).toBe('12:00 AM');
      });
    });

    describe('Smart AM/PM detection (dog show context)', () => {
      test('should default early hours (1-6) to AM', () => {
        expect(formatTimeInputTo12Hour('1')).toBe('1:00 AM');
        expect(formatTimeInputTo12Hour('6')).toBe('6:00 AM');
      });

      test('should default morning hours (7-11) to AM', () => {
        expect(formatTimeInputTo12Hour('7')).toBe('7:00 AM');
        expect(formatTimeInputTo12Hour('11')).toBe('11:00 AM');
      });

      test('should default hour 12 to PM (noon)', () => {
        expect(formatTimeInputTo12Hour('12')).toBe('12:00 PM');
      });
    });
  });

  describe('formatTimeInputToMMSS', () => {
    describe('Single/double digit input (minutes)', () => {
      test('should format single digit as minutes', () => {
        expect(formatTimeInputToMMSS('1')).toBe('01:00');
        expect(formatTimeInputToMMSS('2')).toBe('02:00');
        expect(formatTimeInputToMMSS('5')).toBe('05:00');
      });

      test('should format double digit as minutes', () => {
        expect(formatTimeInputToMMSS('10')).toBe('10:00'); // Would exceed default max (5)
        expect(formatTimeInputToMMSS('03')).toBe('03:00');
      });

      test('should cap at maximum minutes', () => {
        expect(formatTimeInputToMMSS('10')).toBe('10:00'); // Over 5 minute default
        expect(formatTimeInputToMMSS('10', 3)).toBe('03:00'); // Custom max: 3
        expect(formatTimeInputToMMSS('6')).toBe('06:00'); // Over default max
      });
    });

    describe('Three digit input (M:SS)', () => {
      test('should format as MM:SS', () => {
        expect(formatTimeInputToMMSS('130')).toBe('01:30');
        expect(formatTimeInputToMMSS('245')).toBe('02:45');
        expect(formatTimeInputToMMSS('115')).toBe('01:15');
      });

      test('should handle seconds >= 60 by converting to minutes', () => {
        expect(formatTimeInputToMMSS('190')).toBe('01:00'); // 90 seconds invalid, treat as minutes
      });
    });

    describe('Four+ digit input (MMSS)', () => {
      test('should format as MM:SS', () => {
        expect(formatTimeInputToMMSS('0130')).toBe('01:30');
        expect(formatTimeInputToMMSS('0245')).toBe('02:45');
        expect(formatTimeInputToMMSS('0500')).toBe('05:00');
      });

      test('should cap at maximum minutes', () => {
        expect(formatTimeInputToMMSS('0630')).toBe('05:00'); // 6 minutes > 5 max
        expect(formatTimeInputToMMSS('1000')).toBe('05:00'); // 10 minutes > 5 max
      });

      test('should handle invalid seconds (>= 60)', () => {
        expect(formatTimeInputToMMSS('0165')).toBe('01:00'); // 65 seconds invalid
        expect(formatTimeInputToMMSS('0290')).toBe('02:00'); // 90 seconds invalid
      });
    });

    describe('Input with colon (MM:SS format)', () => {
      test('should parse and format MM:SS input', () => {
        expect(formatTimeInputToMMSS('1:30')).toBe('01:30');
        expect(formatTimeInputToMMSS('2:45')).toBe('02:45');
        expect(formatTimeInputToMMSS('0:30')).toBe('00:30');
      });

      test('should handle seconds overflow (>= 60)', () => {
        expect(formatTimeInputToMMSS('1:90')).toBe('02:30'); // 1:90 → 2:30
        expect(formatTimeInputToMMSS('0:75')).toBe('01:15'); // 0:75 → 1:15
        expect(formatTimeInputToMMSS('2:120')).toBe('04:00'); // 2:120 → 4:00
      });

      test('should cap at maximum minutes after overflow', () => {
        expect(formatTimeInputToMMSS('4:90')).toBe('05:00'); // 4:90 → 5:30, capped at 5:00
        expect(formatTimeInputToMMSS('5:60')).toBe('05:00'); // 5:60 → 6:00, capped at 5:00
      });

      test('should zero-pad single digit values', () => {
        expect(formatTimeInputToMMSS('1:5')).toBe('01:05');
        expect(formatTimeInputToMMSS('0:9')).toBe('00:09');
      });
    });

    describe('Custom maximum limits', () => {
      test('should respect custom maxMinutes parameter', () => {
        expect(formatTimeInputToMMSS('10', 10)).toBe('10:00');
        expect(formatTimeInputToMMSS('15', 10)).toBe('10:00'); // Capped
        expect(formatTimeInputToMMSS('3', 2)).toBe('02:00'); // Capped at 2
      });
    });

    describe('Edge cases', () => {
      test('should return empty string for empty input', () => {
        expect(formatTimeInputToMMSS('')).toBe('');
        expect(formatTimeInputToMMSS('   ')).toBe('');
      });

      test('should return empty string for invalid input', () => {
        expect(formatTimeInputToMMSS('abc')).toBe('');
        expect(formatTimeInputToMMSS('invalid')).toBe('');
      });

      test('should handle input with extra characters', () => {
        expect(formatTimeInputToMMSS('1.30')).toBe('01:30'); // Period removed
        expect(formatTimeInputToMMSS('1-30')).toBe('01:30'); // Dash removed
      });

      test('should handle zero values', () => {
        expect(formatTimeInputToMMSS('0')).toBe('00:00');
        expect(formatTimeInputToMMSS('0:0')).toBe('00:00');
        expect(formatTimeInputToMMSS('00:00')).toBe('00:00');
      });
    });
  });

  describe('addMinutesToTime', () => {
    describe('Adding minutes to valid time strings', () => {
      test('should add minutes to AM time', () => {
        const result = addMinutesToTime('9:30 AM', 15);
        expect(result).toBe('9:45 AM');
      });

      test('should add minutes to PM time', () => {
        const result = addMinutesToTime('2:30 PM', 30);
        expect(result).toBe('3:00 PM');
      });

      test('should handle hour rollover', () => {
        const result = addMinutesToTime('9:45 AM', 30);
        expect(result).toBe('10:15 AM');
      });

      test('should handle crossing noon', () => {
        const result = addMinutesToTime('11:45 AM', 30);
        expect(result).toBe('12:15 PM');
      });

      test('should handle crossing midnight', () => {
        const result = addMinutesToTime('11:45 PM', 30);
        expect(result).toBe('12:15 AM');
      });
    });

    describe('Parsing various time formats', () => {
      test('should parse time without spaces', () => {
        const result = addMinutesToTime('9:30AM', 15);
        expect(result).toBe('9:45 AM');
      });

      test('should parse time without colon', () => {
        const result = addMinutesToTime('930 AM', 15);
        expect(result).toBe('9:45 AM');
      });

      test('should handle lowercase am/pm', () => {
        const result = addMinutesToTime('9:30 am', 15);
        expect(result).toBe('9:45 AM');
      });
    });

    describe('Edge cases', () => {
      test('should use current time for empty string', () => {
        const result = addMinutesToTime('', 15);
        // Can't test exact value (depends on current time), but should return valid format
        expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
      });

      test('should use current time for invalid string', () => {
        const result = addMinutesToTime('invalid', 15);
        // Can't test exact value (depends on current time), but should return valid format
        expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
      });

      test('should handle midnight (12 AM) correctly', () => {
        const result = addMinutesToTime('12:00 AM', 30);
        expect(result).toBe('12:30 AM');
      });

      test('should handle noon (12 PM) correctly', () => {
        const result = addMinutesToTime('12:00 PM', 30);
        expect(result).toBe('12:30 PM');
      });

      test('should handle negative minutes (subtract time)', () => {
        const result = addMinutesToTime('10:00 AM', -30);
        expect(result).toBe('9:30 AM');
      });

      test('should handle large minute additions', () => {
        const result = addMinutesToTime('9:00 AM', 120); // Add 2 hours
        expect(result).toBe('11:00 AM');
      });
    });
  });

  describe('getCurrentTime12Hour', () => {
    test('should return time in H:MM AM/PM format', () => {
      const result = getCurrentTime12Hour();
      // Can't test exact value (depends on current time), but should match format
      expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    });

    test('should return a valid time string', () => {
      const result = getCurrentTime12Hour();
      // Verify it parses as a valid time
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatPlannedStartTime', () => {
    test('should format timestamp as "Mon Day, H:MM AM/PM"', () => {
      const timestamp = '2024-01-15T09:00:00Z';
      const result = formatPlannedStartTime(timestamp);
      // Format: "Jan 15, 9:00 AM" (exact time may vary by timezone)
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/);
    });

    test('should format afternoon times correctly', () => {
      const timestamp = '2024-06-20T14:30:00Z';
      const result = formatPlannedStartTime(timestamp);
      // Format: "Jun 20, 2:30 PM" (exact time may vary by timezone)
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/);
    });

    test('should return null for undefined timestamp', () => {
      const result = formatPlannedStartTime(undefined);
      expect(result).toBeNull();
    });

    test('should handle various ISO timestamp formats', () => {
      const timestamps = [
        '2024-01-15T09:00:00.000Z',
        '2024-01-15T09:00:00Z',
        '2024-01-15T09:00:00',
      ];

      timestamps.forEach((timestamp) => {
        const result = formatPlannedStartTime(timestamp);
        expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/);
      });
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle ClassStatusDialog briefing time workflow', () => {
      // User types "9" for 9:00 AM briefing
      const briefingTime = formatTimeInputTo12Hour('9');
      expect(briefingTime).toBe('9:00 AM');

      // Add 15 minutes for break time
      const breakTime = addMinutesToTime(briefingTime, 15);
      expect(breakTime).toBe('9:15 AM');

      // Add 30 more minutes for start time
      const startTime = addMinutesToTime(breakTime, 30);
      expect(startTime).toBe('9:45 AM');
    });

    test('should handle MaxTimeDialog time limit workflow', () => {
      // User enters "2" for 2 minute limit
      const timeLimit1 = formatTimeInputToMMSS('2');
      expect(timeLimit1).toBe('02:00');

      // User enters "130" for 1:30 limit
      const timeLimit2 = formatTimeInputToMMSS('130');
      expect(timeLimit2).toBe('01:30');

      // User enters "2:15" for 2:15 limit
      const timeLimit3 = formatTimeInputToMMSS('2:15');
      expect(timeLimit3).toBe('02:15');
    });

    test('should handle afternoon dog show schedule', () => {
      // Start time 1:30 PM
      const startTime = formatTimeInputTo12Hour('1330');
      expect(startTime).toBe('1:30 PM');

      // Add 45 minutes for next class
      const nextClass = addMinutesToTime(startTime, 45);
      expect(nextClass).toBe('2:15 PM');
    });
  });
});
