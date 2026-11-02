import { describe, expect, it } from 'vitest';
import type { CheckInClassEntry, ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';
import { markCheckInReportCheckedIn } from './showMapCheckInOptimisticUpdates';

function entry(entryId: string, checkInStatus: string): CheckInClassEntry {
  return {
    entryId,
    classId: `class-${entryId}`,
    className: 'Novice A',
    checkInStatus,
    trialId: 't1',
  };
}

function group(entries: CheckInClassEntry[]): ExhibitorCheckInGroup {
  return {
    key: 'dog-1:handler-1',
    armbandNumber: 101,
    handlerName: 'Pat Handler',
    dogName: 'Rex',
    dogBreed: 'Beagle',
    entries,
    totalEntries: entries.length,
    checkedInCount: 0,
    summaryStatus: 'none',
  };
}

// MYK9-1658: the optimistic check-in report must not count a `no-status`
// sibling as checked in, or the gate desk shows a dog as fully checked in.
describe('markCheckInReportCheckedIn', () => {
  it('leaves a no-status sibling uncounted and reports the group as partial', () => {
    const [result] =
      markCheckInReportCheckedIn(
        [group([entry('e1', 'no-status'), entry('e2', 'no-status')])],
        'e1'
      ) ?? [];

    expect(result).toMatchObject({ checkedInCount: 1, summaryStatus: 'partial' });
    expect(result?.entries.map(e => e.checkInStatus)).toEqual(['checked-in', 'no-status']);
  });

  it('counts a sibling with an empty status as not checked in', () => {
    const [result] =
      markCheckInReportCheckedIn([group([entry('e1', 'no-status'), entry('e2', '')])], 'e1') ?? [];

    expect(result).toMatchObject({ checkedInCount: 1, summaryStatus: 'partial' });
  });

  it('reports checked-in once every entry has a status', () => {
    const [result] =
      markCheckInReportCheckedIn(
        [group([entry('e1', 'no-status'), entry('e2', 'at-gate')])],
        'e1'
      ) ?? [];

    expect(result).toMatchObject({ checkedInCount: 2, summaryStatus: 'checked-in' });
  });

  it('returns groups without the entry unchanged and passes undefined through', () => {
    const other = group([entry('e9', 'no-status')]);

    expect(markCheckInReportCheckedIn([other], 'e1')?.[0]).toBe(other);
    expect(markCheckInReportCheckedIn(undefined, 'e1')).toBeUndefined();
  });
});
