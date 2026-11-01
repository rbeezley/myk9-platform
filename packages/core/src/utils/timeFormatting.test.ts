import { describe, it, expect } from 'vitest';
import {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  splitSecondsToCentis,
  splitMsToCentis,
  formatSecondsAsMSSCC,
  formatMsAsMSSCC,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
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

  it('should carry a rounded-up hundredth instead of printing 60.00 seconds (MYK9-1225)', () => {
    expect(formatMilliseconds(61230)).toBe('1:01.23');
    expect(formatMilliseconds(59999)).toBe('1:00.00');
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

  it('does not truncate 61.23 and carries 59.999 (MYK9-1225)', () => {
    expect(formatSecondsToTime(61.23)).toBe('01:01.23');
    expect(formatSecondsToTime(59.999)).toBe('01:00.00');
    expect(formatSecondsToTime(59.995)).toBe('01:00.00');
  });

  it('should format 30.12 as 00:30.12', () => {
    expect(formatSecondsToTime(30.12)).toBe('00:30.12');
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

describe('centisecond splitters (MYK9-1225)', () => {
  it('splits 61.23 seconds without truncating the hundredths', () => {
    expect(splitSecondsToCentis(61.23)).toEqual({ minutes: 1, seconds: 1, centis: 23 });
    expect(formatSecondsAsMSSCC(61.23)).toBe('1:01.23');
  });

  it('carries a rounded-up hundredth into the second and minute', () => {
    expect(splitSecondsToCentis(59.995)).toEqual({ minutes: 1, seconds: 0, centis: 0 });
    expect(formatSecondsAsMSSCC(59.999)).toBe('1:00.00');
    expect(formatSecondsAsMSSCC(119.999)).toBe('2:00.00');
  });

  it('keeps zero, whole minutes and exact fractions', () => {
    expect(formatSecondsAsMSSCC(0)).toBe('0:00.00');
    expect(formatSecondsAsMSSCC(60)).toBe('1:00.00');
    expect(formatSecondsAsMSSCC(61.25)).toBe('1:01.25');
    expect(formatSecondsAsMSSCC(59.99)).toBe('0:59.99');
  });

  it('splits integer milliseconds, rounding to the nearest hundredth', () => {
    expect(splitMsToCentis(61230)).toEqual({ minutes: 1, seconds: 1, centis: 23 });
    expect(formatMsAsMSSCC(2010)).toBe('0:02.01');
    expect(formatMsAsMSSCC(59999)).toBe('1:00.00');
    expect(formatMsAsMSSCC(87350)).toBe('1:27.35');
  });

  it('floors for a live running clock but never prints :60 (round vs floor)', () => {
    expect(splitMsToCentis(59996, 'floor')).toEqual({ minutes: 0, seconds: 59, centis: 99 });
    expect(formatMsAsMSSCC(59996, 'floor')).toBe('0:59.99');
    expect(formatMsAsMSSCC(59996)).toBe('1:00.00');
    expect(formatMsAsMSSCC(119999, 'floor')).toBe('1:59.99');
    expect(formatMsAsMSSCC(60000, 'floor')).toBe('1:00.00');
    expect(formatMsAsMSSCC(87359, 'floor')).toBe('1:27.35');
  });
});
