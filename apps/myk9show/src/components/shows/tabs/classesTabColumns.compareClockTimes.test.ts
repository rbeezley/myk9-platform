import { describe, expect, it } from 'vitest';
import { compareClockTimes } from './classesTabColumns';

describe('compareClockTimes (Select classes Time column)', () => {
  it('treats two unscheduled classes as equal', () => {
    expect(compareClockTimes(null, null)).toBe(0);
    expect(compareClockTimes(undefined, '')).toBe(0);
  });

  it('sorts an unscheduled class after a scheduled one', () => {
    expect(compareClockTimes(null, '9:00 AM')).toBeGreaterThan(0);
    expect(compareClockTimes('9:00 AM', null)).toBeLessThan(0);
  });

  it('orders scheduled classes by clock time, not text', () => {
    expect(compareClockTimes('9:00 AM', '10:00 AM')).toBeLessThan(0);
    expect(compareClockTimes('1:30 PM', '10:00 AM')).toBeGreaterThan(0);
    expect(compareClockTimes('10:00 AM', '10:00 AM')).toBe(0);
  });

  it('gives a stable order for a mixed list', () => {
    const times = ['10:00 AM', null, '9:00 AM', null, '1:30 PM'];
    expect([...times].sort(compareClockTimes)).toEqual([
      '9:00 AM',
      '10:00 AM',
      '1:30 PM',
      null,
      null,
    ]);
  });
});
