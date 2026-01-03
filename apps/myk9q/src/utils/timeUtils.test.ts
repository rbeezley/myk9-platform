/**
 * Unit Tests for Time Utility Functions
 */

import {
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
} from './timeUtils';

describe('formatSecondsToMMSS', () => {
  test('should format seconds to MM:SS', () => {
    expect(formatSecondsToMMSS(0)).toBe('00:00');
    expect(formatSecondsToMMSS(30)).toBe('00:30');
    expect(formatSecondsToMMSS(60)).toBe('01:00');
    expect(formatSecondsToMMSS(125)).toBe('02:05');
    expect(formatSecondsToMMSS(3665)).toBe('61:05');
  });

  test('should pad single digits with zeros', () => {
    expect(formatSecondsToMMSS(5)).toBe('00:05');
    expect(formatSecondsToMMSS(65)).toBe('01:05');
  });
});

describe('formatSecondsToTime', () => {
  test('should format number to MM:SS.HH', () => {
    expect(formatSecondsToTime(0)).toBe('00:00.00');
    expect(formatSecondsToTime(30.5)).toBe('00:30.50');
    expect(formatSecondsToTime(125.75)).toBe('02:05.75');
    expect(formatSecondsToTime(65.123)).toBe('01:05.12');
  });

  test('should handle string input', () => {
    expect(formatSecondsToTime('30.5')).toBe('00:30.50');
    expect(formatSecondsToTime('125.75')).toBe('02:05.75');
  });

  test('should handle null and empty values', () => {
    expect(formatSecondsToTime(null)).toBe('00:00.00');
    expect(formatSecondsToTime('')).toBe('00:00.00');
  });

  test('should handle invalid input', () => {
    expect(formatSecondsToTime('invalid')).toBe('00:00.00');
    expect(formatSecondsToTime(-10)).toBe('00:00.00');
  });
});

describe('convertTimeToSeconds', () => {
  test('should convert MM:SS.ss format to seconds', () => {
    expect(convertTimeToSeconds('00:30.50')).toBe(30.5);
    expect(convertTimeToSeconds('02:05.75')).toBe(125.75);
    expect(convertTimeToSeconds('1:30.00')).toBe(90);
  });

  test('should convert SS.ss format to seconds', () => {
    expect(convertTimeToSeconds('30.5')).toBe(30.5);
    expect(convertTimeToSeconds('125.75')).toBe(125.75);
  });

  test('should handle MM:SS format (no hundredths)', () => {
    expect(convertTimeToSeconds('2:05')).toBe(125);
    expect(convertTimeToSeconds('1:30')).toBe(90);
  });

  test('should handle empty and invalid input', () => {
    expect(convertTimeToSeconds('')).toBe(0);
    expect(convertTimeToSeconds('   ')).toBe(0);
    expect(convertTimeToSeconds('invalid')).toBe(0);
  });
});

describe('formatTimeForDisplay', () => {
  test('should return already formatted time strings', () => {
    expect(formatTimeForDisplay('02:05.75')).toBe('02:05.75');
    expect(formatTimeForDisplay('1:30.00')).toBe('1:30.00');
  });

  test('should format numeric seconds', () => {
    expect(formatTimeForDisplay(125.75)).toBe('02:05.75');
    expect(formatTimeForDisplay(30.5)).toBe('00:30.50');
  });

  test('should format string seconds', () => {
    expect(formatTimeForDisplay('125.75')).toBe('02:05.75');
    expect(formatTimeForDisplay('30.5')).toBe('00:30.50');
  });

  test('should handle zero', () => {
    expect(formatTimeForDisplay(0)).toBe('00:00.00');
  });

  test('should handle null', () => {
    expect(formatTimeForDisplay(null)).toBe('00:00.00');
  });
});

describe('formatTimeLimitSeconds', () => {
  test('should format time limits to M:SS format', () => {
    expect(formatTimeLimitSeconds(125)).toBe('2:05');
    expect(formatTimeLimitSeconds(65)).toBe('1:05');
    expect(formatTimeLimitSeconds(30)).toBe('0:30');
    expect(formatTimeLimitSeconds(3665)).toBe('61:05');
  });

  test('should pad seconds with zero', () => {
    expect(formatTimeLimitSeconds(5)).toBe('0:05');
    expect(formatTimeLimitSeconds(65)).toBe('1:05');
  });

  test('should return empty string for zero', () => {
    expect(formatTimeLimitSeconds(0)).toBe('');
  });

  test('should return empty string for null/undefined', () => {
    expect(formatTimeLimitSeconds(null)).toBe('');
    expect(formatTimeLimitSeconds(undefined)).toBe('');
  });

  test('should handle single-digit minutes without padding', () => {
    expect(formatTimeLimitSeconds(300)).toBe('5:00');
    expect(formatTimeLimitSeconds(540)).toBe('9:00');
  });

  test('should handle multi-digit minutes without padding', () => {
    expect(formatTimeLimitSeconds(600)).toBe('10:00');
    expect(formatTimeLimitSeconds(3665)).toBe('61:05');
  });
});
