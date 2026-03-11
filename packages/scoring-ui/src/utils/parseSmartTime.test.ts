import { describe, it, expect } from 'vitest';
import { parseSmartTime } from './parseSmartTime';

describe('parseSmartTime', () => {
  it('parses "123" as 1:23.00', () => {
    expect(parseSmartTime('123')).toBe('1:23.00');
  });

  it('parses "90" as 1:30.00', () => {
    expect(parseSmartTime('90')).toBe('1:30.00');
  });

  it('parses "45" as 0:45.00', () => {
    expect(parseSmartTime('45')).toBe('0:45.00');
  });

  it('parses "1:23" as 1:23.00', () => {
    expect(parseSmartTime('1:23')).toBe('1:23.00');
  });

  it('parses "1:23.45" as-is', () => {
    expect(parseSmartTime('1:23.45')).toBe('1:23.45');
  });

  it('parses "0:05.23" as-is', () => {
    expect(parseSmartTime('0:05.23')).toBe('0:05.23');
  });

  it('returns empty string for empty input', () => {
    expect(parseSmartTime('')).toBe('');
  });

  it('returns empty string for non-numeric input', () => {
    expect(parseSmartTime('abc')).toBe('');
  });

  it('parses "5" as 0:05.00', () => {
    expect(parseSmartTime('5')).toBe('0:05.00');
  });

  it('parses "300" as 5:00.00', () => {
    expect(parseSmartTime('300')).toBe('5:00.00');
  });

  it('handles decimal input "45.5" as 0:45.50', () => {
    expect(parseSmartTime('45.5')).toBe('0:45.50');
  });
});
