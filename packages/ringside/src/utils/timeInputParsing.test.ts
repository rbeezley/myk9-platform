/**
 * Unit Tests for Time Input Parsing Utilities
 *
 * Core smoke tests covering main functionality of time parsing functions.
 */

import { parseSmartTime, isValidTimeFormat } from './timeInputParsing';

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
