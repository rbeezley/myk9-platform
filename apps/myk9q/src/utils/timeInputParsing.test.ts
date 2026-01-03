/**
 * Unit Tests for Time Input Parsing Utilities
 * 
 * Core smoke tests covering main functionality of time parsing functions.
 */

import {
  parseSmartTime,
  isValidTimeFormat,
  timeToSeconds,
  secondsToTime,
  compareTime
} from './timeInputParsing';

describe('parseSmartTime', () => {
  test('should parse MM:SS.HH format', () => {
    expect(parseSmartTime('01:30.50')).toBe('01:30.50');
    expect(parseSmartTime('00:05.99')).toBe('00:05.99');
    expect(parseSmartTime('59:59.99')).toBe('59:59.99');
    expect(parseSmartTime('1:30.50')).toBe('01:30.50'); // zero-padding
  });

  test('should parse MM:SS format (no hundredths)', () => {
    expect(parseSmartTime('01:30')).toBe('01:30.00');
    expect(parseSmartTime('0:05')).toBe('00:05.00');
  });

  test('should parse decimal seconds', () => {
    expect(parseSmartTime('45.5')).toBe('00:45.50');
    expect(parseSmartTime('123.45')).toBe('02:03.45'); // total seconds
  });

  test('should parse 1-digit as minutes', () => {
    expect(parseSmartTime('5')).toBe('05:00.00');
  });

  test('should parse 2-digit as hundredths', () => {
    expect(parseSmartTime('45')).toBe('00:00.45');
  });

  test('should parse 3-digit as SYY', () => {
    expect(parseSmartTime('345')).toBe('00:03.45');
  });

  test('should parse 4-digit as SSYY', () => {
    expect(parseSmartTime('2345')).toBe('00:23.45');
  });

  test('should parse 5-digit as MSSYY', () => {
    expect(parseSmartTime('12345')).toBe('01:23.45');
  });

  test('should parse 6-digit as MMSSYY', () => {
    expect(parseSmartTime('012345')).toBe('01:23.45');
  });

  test('should handle empty input', () => {
    expect(parseSmartTime('')).toBe('');
    expect(parseSmartTime('   ')).toBe('');
  });

  test('should trim whitespace', () => {
    expect(parseSmartTime(' 01:30.50 ')).toBe('01:30.50');
  });
});

describe('isValidTimeFormat', () => {
  test('should validate correct MM:SS.HH format', () => {
    expect(isValidTimeFormat('01:30.50')).toBe(true);
    expect(isValidTimeFormat('00:00.00')).toBe(true);
    expect(isValidTimeFormat('59:59.99')).toBe(true);
  });

  test('should reject invalid formats', () => {
    expect(isValidTimeFormat('60:00.00')).toBe(false); // minutes > 59
    expect(isValidTimeFormat('01:60.00')).toBe(false); // seconds > 59
    expect(isValidTimeFormat('01:30.100')).toBe(false); // hundredths > 99
    expect(isValidTimeFormat('1:30.50')).toBe(false); // not zero-padded
    expect(isValidTimeFormat('')).toBe(false);
  });
});

describe('timeToSeconds', () => {
  test('should convert MM:SS.HH to decimal seconds', () => {
    expect(timeToSeconds('00:00.00')).toBe(0);
    expect(timeToSeconds('00:01.00')).toBe(1);
    expect(timeToSeconds('01:00.00')).toBe(60);
    expect(timeToSeconds('01:30.50')).toBe(90.5);
  });

  test('should handle hundredths correctly', () => {
    expect(timeToSeconds('00:00.01')).toBe(0.01);
    expect(timeToSeconds('00:30.25')).toBe(30.25);
  });

  test('should handle complex times', () => {
    expect(timeToSeconds('02:15.75')).toBe(135.75);
  });
});

describe('secondsToTime', () => {
  test('should convert decimal seconds to MM:SS.HH', () => {
    expect(secondsToTime(0)).toBe('00:00.00');
    expect(secondsToTime(1)).toBe('00:01.00');
    expect(secondsToTime(60)).toBe('01:00.00');
    expect(secondsToTime(90.5)).toBe('01:30.50');
  });

  test('should handle hundredths', () => {
    expect(secondsToTime(30.25)).toBe('00:30.25');
  });

  test('should handle complex times', () => {
    expect(secondsToTime(135.75)).toBe('02:15.75');
  });
});

describe('compareTime', () => {
  test('should return 0 for equal times', () => {
    expect(compareTime('01:30.50', '01:30.50')).toBe(0);
    expect(compareTime('00:00.00', '00:00.00')).toBe(0);
  });

  test('should return -1 when first time is less', () => {
    expect(compareTime('01:30.50', '01:30.51')).toBe(-1);
    expect(compareTime('00:00.00', '00:00.01')).toBe(-1);
  });

  test('should return 1 when first time is greater', () => {
    expect(compareTime('01:30.51', '01:30.50')).toBe(1);
    expect(compareTime('02:00.00', '01:00.00')).toBe(1);
  });
});

describe('Round-trip consistency', () => {
  test('should maintain consistency through conversion', () => {
    const testCases = ['01:30.50', '00:05.99', '59:59.99', '00:00.00'];
    testCases.forEach(time => {
      const seconds = timeToSeconds(time);
      const backToTime = secondsToTime(seconds);
      expect(backToTime).toBe(time);
    });
  });
});
