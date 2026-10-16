import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import { orderRingClassesByDay } from './orderRingClassesByDay';
import type { YourRingClass } from './atShowClassListSort';

function card(id: string, trialDate: string | undefined, trialTimeZone = 'America/New_York') {
  return {
    entry: { id, class_name: id, class_order: 1 } as ClassEntry,
    scanPriority: 1,
    trialTimeZone,
    trialDate,
  } satisfies YourRingClass;
}

const NOW = new Date('2026-10-16T15:00:00Z').getTime();

describe('orderRingClassesByDay', () => {
  it('puts today first, then upcoming by date, then past most recent first', () => {
    const result = orderRingClassesByDay(
      [
        card('past1', '2026-10-14'),
        card('up2', '2026-10-18'),
        card('past2', '2026-10-15'),
        card('today', '2026-10-16'),
        card('up1', '2026-10-17'),
      ],
      NOW
    );
    expect(result.map(r => [r.entry.id, r.dayBucket])).toEqual([
      ['today', 'today'],
      ['up1', 'upcoming'],
      ['up2', 'upcoming'],
      ['past2', 'past'],
      ['past1', 'past'],
    ]);
  });

  it("counts a trial as today by the trial's timezone, not UTC", () => {
    // 2026-10-17T02:00Z is still Oct 16 evening in New York.
    const lateNow = new Date('2026-10-17T02:00:00Z').getTime();
    const result = orderRingClassesByDay(
      [card('next', '2026-10-17'), card('ny', '2026-10-16')],
      lateNow
    );
    expect(result.map(r => [r.entry.id, r.dayBucket])).toEqual([
      ['ny', 'today'],
      ['next', 'upcoming'],
    ]);
  });

  it('keeps caller order within a day and treats an unknown date as upcoming', () => {
    const result = orderRingClassesByDay(
      [card('b', '2026-10-16'), card('a', '2026-10-16'), card('none', undefined)],
      NOW
    );
    expect(result.map(r => [r.entry.id, r.dayBucket])).toEqual([
      ['b', 'today'],
      ['a', 'today'],
      ['none', 'upcoming'],
    ]);
  });
});
