import { describe, it, expect } from 'vitest';
import { formatSearchTime, parseSearchTimeDigits } from '../sorting';

describe('formatSearchTime', () => {
  it('formats 4 digits as 0:SS.hh', () => {
    expect(formatSearchTime('4532')).toBe('0:45.32');
  });

  it('formats 5 digits as M:SS.hh', () => {
    expect(formatSearchTime('12345')).toBe('1:23.45');
  });

  it('formats 6 digits as MM:SS.hh', () => {
    expect(formatSearchTime('100032')).toBe('10:00.32');
  });

  it('formats 3 digits as 0:0S.hh', () => {
    expect(formatSearchTime('532')).toBe('0:05.32');
  });

  it('formats 2 digits as hundredths only', () => {
    expect(formatSearchTime('32')).toBe('0:00.32');
  });

  it('formats 1 digit as hundredths only', () => {
    expect(formatSearchTime('5')).toBe('0:00.05');
  });

  it('returns empty string for empty input', () => {
    expect(formatSearchTime('')).toBe('');
  });

  it('caps seconds at 59', () => {
    // 7532 → last 2 = 32 (hundredths), next 2 = 75 → capped at 59
    expect(formatSearchTime('7532')).toBe('1:15.32');
  });
});

describe('parseSearchTimeDigits', () => {
  it('converts formatted time back to digits', () => {
    expect(parseSearchTimeDigits('1:23.45')).toBe('12345');
  });

  it('strips leading zeros from minutes', () => {
    expect(parseSearchTimeDigits('0:45.32')).toBe('4532');
  });

  it('handles hundredths only', () => {
    expect(parseSearchTimeDigits('0:00.32')).toBe('32');
  });
});
