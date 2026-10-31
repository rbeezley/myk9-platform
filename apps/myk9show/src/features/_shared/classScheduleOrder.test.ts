import { describe, expect, it } from 'vitest';
import { calendarDayKey, compareClassSchedule, type ClassScheduleKey } from './classScheduleOrder';

const sorted = (rows: ClassScheduleKey[]) => [...rows].sort(compareClassSchedule);

describe('classScheduleOrder', () => {
  it('orders by calendar day, earliest first', () => {
    const rows = [
      { day: '2026-10-18' },
      { day: '2026-10-14' },
      { day: '2026-10-16T00:00:00+00:00' },
    ];
    expect(sorted(rows).map(r => calendarDayKey(r.day))).toEqual([
      '2026-10-14',
      '2026-10-16',
      '2026-10-18',
    ]);
  });

  it('orders same-day rows by start time, untimed last', () => {
    const rows = [
      { day: '2026-10-14', time: null },
      { day: '2026-10-14', time: '1:00 PM' },
      { day: '2026-10-14', time: '9:30 AM' },
      { day: '2026-10-14', time: '10:00 AM' },
    ];
    expect(sorted(rows).map(r => r.time)).toEqual(['9:30 AM', '10:00 AM', '1:00 PM', null]);
  });

  it('puts undated rows after dated ones and keeps ties in incoming order', () => {
    const rows = [
      { day: null, time: 'a' },
      { day: '2026-10-14', time: 'b' },
      { day: '2026-10-14', time: 'c' },
    ];
    expect(sorted(rows).map(r => r.time)).toEqual(['b', 'c', 'a']);
  });
});
