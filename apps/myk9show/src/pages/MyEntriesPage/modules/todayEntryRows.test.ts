import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { withFixtureKind } from '@/test/fixtures/entryClassKind';
import { groupEntriesByOrder } from './groupEntriesByOrder';
import type { EntryClass, MyEntry } from './my-entries-types';
import { selectTodayEntryRows, todayClassIds } from './todayEntryRows';

// 12:00 in New York on the show's first day.
const NOW = new Date('2026-10-24T16:00:00Z');

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return withFixtureKind({
    id: 'c1',
    classId: 'class-1',
    name: 'Container Search',
    number: '101',
    fee: 25,
    status: 'entered',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    trialDate: new Date(2026, 9, 24),
    trialTimezone: 'America/New_York',
    ...overrides,
  });
}

function makeRows(overrides: Partial<MyEntry> = {}, classes: EntryClass[] = [makeClass()]) {
  const row: MyEntry = {
    id: 'e1',
    registrationId: 'r1',
    showId: 's1',
    showName: 'Heartland Classic',
    showDate: new Date(2026, 9, 24),
    showEndDate: new Date(2026, 9, 25),
    location: { venue: 'Expo Hall', city: 'Denver', state: 'CO' },
    dogName: 'Rex',
    dogId: 'd1',
    classes,
    dogs: [],
    totalFee: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-09-01'),
    lastUpdated: new Date('2026-09-02'),
    ...overrides,
  };
  return groupEntriesByOrder([row], NOW);
}

describe('selectTodayEntryRows', () => {
  it('lists an entry once My Shows has it, with no per-show replica involved', () => {
    const rows = selectTodayEntryRows(makeRows(), NOW, undefined);
    expect(rows).toEqual([
      expect.objectContaining({ dogName: 'Rex', className: 'Container Search' }),
    ]);
  });

  it('shows only the trial day that is today on a multi-day show', () => {
    const entries = makeRows({}, [
      makeClass({ id: 'c1', name: 'Today Class' }),
      makeClass({
        id: 'c2',
        classId: 'class-2',
        name: 'Tomorrow Class',
        trialDate: new Date(2026, 9, 25),
      }),
      makeClass({
        id: 'c3',
        classId: 'class-3',
        name: 'Yesterday Class',
        trialDate: new Date(2026, 9, 23),
      }),
    ]);
    expect(selectTodayEntryRows(entries, NOW, undefined).map(r => r.className)).toEqual([
      'Today Class',
    ]);
    expect(todayClassIds(entries, NOW)).toEqual(['class-1']);
  });

  it('reckons the day in the trial timezone, not the device', () => {
    // 02:00 UTC on the 25th is still the 24th in Los Angeles.
    const lateNow = new Date('2026-10-25T02:00:00Z');
    const entries = makeRows({}, [makeClass({ trialTimezone: 'America/Los_Angeles' })]);
    expect(selectTodayEntryRows(entries, lateNow, undefined)).toHaveLength(1);
  });

  it('offers "Check in" only where My Shows does', () => {
    const open = selectTodayEntryRows(makeRows(), NOW, undefined);
    expect(open[0]?.statusText).toBe('Check in');

    const disabled = selectTodayEntryRows(makeRows(), NOW, { 'class-1': false });
    expect(disabled[0]?.statusText).toBe('check in with the secretary');

    const pending = selectTodayEntryRows(
      makeRows({ entryStatus: EntryStatus.PENDING, paymentStatus: PaymentStatus.PENDING }),
      NOW,
      undefined
    );
    expect(pending[0]?.statusText).not.toBe('Check in');

    const unresolved = selectTodayEntryRows(
      makeRows({}, [makeClass({ unresolved: true })]),
      NOW,
      undefined
    );
    expect(unresolved[0]?.statusText).not.toBe('Check in');
  });

  it('reads the live check-in state', () => {
    const entries = makeRows({}, [makeClass({ checkInStatus: 'at-gate' })]);
    expect(selectTodayEntryRows(entries, NOW, undefined)[0]?.statusText).toBe('at gate');
  });

  it('is empty when no class runs today', () => {
    const entries = makeRows({}, [makeClass({ trialDate: new Date(2026, 9, 25) })]);
    expect(selectTodayEntryRows(entries, NOW, undefined)).toEqual([]);
  });
});
