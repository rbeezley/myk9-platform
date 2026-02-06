import { describe, it, expect } from 'vitest';
import {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
  parseTimeToMs,
  formatTimeInputToMMSS,
} from './timeFormatting';

describe('formatMilliseconds', () => {
  it('should format 0ms as 0:00.00', () => {
    expect(formatMilliseconds(0)).toBe('0:00.00');
  });

  it('should format 83450ms as 1:23.45', () => {
    expect(formatMilliseconds(83450)).toBe('1:23.45');
  });

  it('should format 1000ms as 0:01.00', () => {
    expect(formatMilliseconds(1000)).toBe('0:01.00');
  });

  it('should format 60000ms as 1:00.00', () => {
    expect(formatMilliseconds(60000)).toBe('1:00.00');
  });

  it('should format 125000ms as 2:05.00', () => {
    expect(formatMilliseconds(125000)).toBe('2:05.00');
  });

  it('should handle fractional milliseconds', () => {
    expect(formatMilliseconds(500)).toBe('0:00.50');
  });
});

describe('formatSecondsToMMSS', () => {
  it('should format 0 seconds as 00:00', () => {
    expect(formatSecondsToMMSS(0)).toBe('00:00');
  });

  it('should format 65 seconds as 01:05', () => {
    expect(formatSecondsToMMSS(65)).toBe('01:05');
  });

  it('should format 125 seconds as 02:05', () => {
    expect(formatSecondsToMMSS(125)).toBe('02:05');
  });

  it('should format 60 seconds as 01:00', () => {
    expect(formatSecondsToMMSS(60)).toBe('01:00');
  });

  it('should format 3600 seconds as 60:00', () => {
    expect(formatSecondsToMMSS(3600)).toBe('60:00');
  });
});

describe('formatSecondsToTime', () => {
  it('should format 83.45 seconds as 01:23.45', () => {
    expect(formatSecondsToTime(83.45)).toBe('01:23.45');
  });

  it('should format string input', () => {
    expect(formatSecondsToTime('60.5')).toBe('01:00.50');
  });

  it('should return 00:00.00 for null', () => {
    expect(formatSecondsToTime(null)).toBe('00:00.00');
  });

  it('should return 00:00.00 for empty string', () => {
    expect(formatSecondsToTime('')).toBe('00:00.00');
  });

  it('should return 00:00.00 for 0', () => {
    expect(formatSecondsToTime(0)).toBe('00:00.00');
  });

  it('should return 00:00.00 for negative number', () => {
    expect(formatSecondsToTime(-5)).toBe('00:00.00');
  });

  it('should return 00:00.00 for NaN string', () => {
    expect(formatSecondsToTime('abc')).toBe('00:00.00');
  });

  it('should format 30.12 as 00:30.12', () => {
    expect(formatSecondsToTime(30.12)).toBe('00:30.12');
  });
});

describe('convertTimeToSeconds', () => {
  it('should convert MM:SS.ss format', () => {
    expect(convertTimeToSeconds('1:23.45')).toBe(83.45);
  });

  it('should convert SS.ss format', () => {
    expect(convertTimeToSeconds('45.5')).toBe(45.5);
  });

  it('should return 0 for empty string', () => {
    expect(convertTimeToSeconds('')).toBe(0);
  });

  it('should return 0 for whitespace', () => {
    expect(convertTimeToSeconds('  ')).toBe(0);
  });

  it('should handle 0:00 format', () => {
    expect(convertTimeToSeconds('0:00')).toBe(0);
  });

  it('should handle whole seconds', () => {
    expect(convertTimeToSeconds('30')).toBe(30);
  });

  it('should handle MM:SS without fractional', () => {
    expect(convertTimeToSeconds('2:30')).toBe(150);
  });

  it('should return 0 for invalid format with multiple colons', () => {
    expect(convertTimeToSeconds('1:2:3')).toBe(0);
  });
});

describe('formatTimeForDisplay', () => {
  it('should return 00:00.00 for null', () => {
    expect(formatTimeForDisplay(null)).toBe('00:00.00');
  });

  it('should return 00:00.00 for undefined', () => {
    expect(formatTimeForDisplay(undefined as unknown as null)).toBe('00:00.00');
  });

  it('should pass through already-formatted time with colon', () => {
    expect(formatTimeForDisplay('1:23.45')).toBe('1:23.45');
  });

  it('should convert number seconds to formatted time', () => {
    expect(formatTimeForDisplay(83.45)).toBe('01:23.45');
  });

  it('should convert string seconds without colon', () => {
    expect(formatTimeForDisplay('60')).toBe('01:00.00');
  });

  it('should handle 0 input', () => {
    expect(formatTimeForDisplay(0)).toBe('00:00.00');
  });
});

describe('formatTimeLimitSeconds', () => {
  it('should return empty string for 0', () => {
    expect(formatTimeLimitSeconds(0)).toBe('');
  });

  it('should return empty string for null', () => {
    expect(formatTimeLimitSeconds(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(formatTimeLimitSeconds(undefined)).toBe('');
  });

  it('should format 125 seconds as 2:05', () => {
    expect(formatTimeLimitSeconds(125)).toBe('2:05');
  });

  it('should format 65 seconds as 1:05', () => {
    expect(formatTimeLimitSeconds(65)).toBe('1:05');
  });

  it('should format 60 seconds as 1:00', () => {
    expect(formatTimeLimitSeconds(60)).toBe('1:00');
  });

  it('should format 180 seconds as 3:00', () => {
    expect(formatTimeLimitSeconds(180)).toBe('3:00');
  });
});

describe('parseTimeToMs', () => {
  it('should parse 3:00 to 180000ms', () => {
    expect(parseTimeToMs('3:00')).toBe(180000);
  });

  it('should parse 1:30 to 90000ms', () => {
    expect(parseTimeToMs('1:30')).toBe(90000);
  });

  it('should return 0 for empty string', () => {
    expect(parseTimeToMs('')).toBe(0);
  });

  it('should handle single digit minutes', () => {
    expect(parseTimeToMs('0:30')).toBe(30000);
  });

  it('should handle fractional seconds', () => {
    expect(parseTimeToMs('1:30.5')).toBe(90500);
  });
});

describe('formatTimeInputToMMSS', () => {
  it('should format single digit as minutes', () => {
    expect(formatTimeInputToMMSS('1')).toBe('01:00');
  });

  it('should format double digit as minutes', () => {
    expect(formatTimeInputToMMSS('2')).toBe('02:00');
  });

  it('should format 3 digits as M:SS', () => {
    expect(formatTimeInputToMMSS('130')).toBe('01:30');
  });

  it('should format 4 digits as MM:SS', () => {
    expect(formatTimeInputToMMSS('0215')).toBe('02:15');
  });

  it('should pass through colon-format input', () => {
    expect(formatTimeInputToMMSS('1:30')).toBe('01:30');
  });

  it('should return empty string for empty input', () => {
    expect(formatTimeInputToMMSS('')).toBe('');
  });

  it('should handle seconds overflow (90 seconds)', () => {
    expect(formatTimeInputToMMSS('0:90')).toBe('01:30');
  });

  it('should respect maxMinutes', () => {
    expect(formatTimeInputToMMSS('10', 5)).toBe('05:00');
  });

  it('should cap at default max for 4-digit input', () => {
    expect(formatTimeInputToMMSS('9900')).toBe('05:00');
  });

  it('should handle invalid seconds in 3-digit input', () => {
    expect(formatTimeInputToMMSS('199')).toBe('01:00'); // 99 seconds >= 60
  });

  it('should strip non-digit non-colon characters', () => {
    expect(formatTimeInputToMMSS('1a3b0')).toBe('01:30');
  });

  it('should cap at maxMinutes with colon format', () => {
    expect(formatTimeInputToMMSS('10:30', 5)).toBe('05:00');
  });

  it('should zero out seconds when exactly at max minutes', () => {
    expect(formatTimeInputToMMSS('5:30', 5)).toBe('05:00');
  });
});
