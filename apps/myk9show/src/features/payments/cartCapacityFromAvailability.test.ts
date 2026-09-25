import { describe, expect, it } from 'vitest';
import type { ClassAvailability } from '@/hooks/useClassAvailability';
import { cartCapacityFromAvailability } from './cartCapacityFromAvailability';

function cls(
  classId: string,
  judgeId: string | null,
  judgeDayAvailable: number
): ClassAvailability {
  return {
    classId,
    className: classId,
    element: null,
    level: 'Novice',
    section: null,
    status: 'upcoming',
    hasStarted: false,
    trialId: 't1',
    trialName: 'Trial 1',
    trialDate: '2026-10-10',
    entryLimit: 0,
    currentEntries: 0,
    spotsAvailable: judgeDayAvailable,
    waitlistCount: 0,
    isFull: judgeDayAvailable <= 0,
    hasWaitlist: false,
    allowsWaitlist: true,
    judgeId,
    judgeDayFull: judgeDayAvailable <= 0,
    judgeDayAvailable,
  };
}

const on = (classId: string, judgeId: string) => ({ classId, judgeId, date: '2026-10-10' });

describe('cartCapacityFromAvailability', () => {
  it("takes a day's exact spots from a class that names it as its tightest", () => {
    const { judgeDays } = cartCapacityFromAvailability(
      [cls('c-ab', 'a', 2), cls('c-b', 'b', 4)],
      [on('c-ab', 'a'), on('c-ab', 'b'), on('c-b', 'b')]
    );
    expect(judgeDays.find(day => day.judgeId === 'b')?.availableSpots).toBe(4);
  });

  it('uses a lower bound, never an overstatement, for a day no class names as its tightest', () => {
    // Both classes on B's day are bounded by A (3 and 2 left there), so B has at
    // least 3. The server may have more, but the cart never shows more than 3.
    const { judgeDays } = cartCapacityFromAvailability(
      [cls('c1', 'a', 3), cls('c2', 'a', 2)],
      [on('c1', 'a'), on('c1', 'b'), on('c2', 'a'), on('c2', 'b')]
    );
    expect(judgeDays.find(day => day.judgeId === 'b')?.availableSpots).toBe(3);
  });

  it('adds no judge day for a class the server reports without a confirmed judge', () => {
    const { judgeDays } = cartCapacityFromAvailability([cls('c1', null, 0)], [on('c1', 'a')]);
    expect(judgeDays).toEqual([]);
  });
});
