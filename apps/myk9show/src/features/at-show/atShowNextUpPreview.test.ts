import { describe, it, expect } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { classifyEntries } from '@/features/_shared/entryAccounting';
import { toQuickAdvanceChips } from './quickAdvanceReplicated';
import {
  buildNextUpPreview,
  isEmptyNextUpPreview,
  isLiveNextUpStatus,
  selectNextUpForCard,
  type AtShowNextUpPreview,
} from './atShowNextUpPreview';

function entry(partial: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return partial as ReplicatedEntry;
}

describe('buildNextUpPreview', () => {
  it('reports the in-ring dog and the next three waiting armbands in run order', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'c', armband: '30', runOrder: 3 }),
      entry({ id: 'a', armband: '10', runOrder: 1, isInRing: true }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
      entry({ id: 'd', armband: '40', runOrder: 4 }),
      entry({ id: 'e', armband: '50', runOrder: 5 }),
    ]);

    expect(preview.inRingArmband).toBe('10');
    expect(preview.nextArmbands).toEqual(['20', '30', '40']);
  });

  it('excludes the in-ring dog from the waiting queue (INTENT 2026-06-11)', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1, isInRing: true }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);

    expect(preview.nextArmbands).toEqual(['20']);
  });

  it('counts the in-ring dog as remaining and scored dogs toward the total', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1, isScored: true }),
      entry({ id: 'b', armband: '20', runOrder: 2, isInRing: true }),
      entry({ id: 'c', armband: '30', runOrder: 3 }),
      entry({ id: 'd', armband: '40', runOrder: 4 }),
    ]);

    expect(preview.remaining).toBe(3);
    expect(preview.total).toBe(4);
  });

  it('omits pulled entries from the queue and the counts', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '10', runOrder: 1 }),
      // `pulled` lives on the CHECK-IN axis: `entries_entry_status_check` has
      // never permitted it as an `entry_status`, so a row carrying it on the
      // lifecycle field is not a shape the database can produce (MYK9-645).
      entry({
        id: 'b',
        armband: '20',
        runOrder: 2,
        entryStatus: 'confirmed',
        checkInStatus: 'pulled',
      }),
    ]);

    expect(preview.nextArmbands).toEqual(['10']);
    expect(preview.remaining).toBe(1);
    expect(preview.total).toBe(1);
  });

  it('reads the snake_case aliases and falls back to armbandNumber', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armbandNumber: '11', runOrder: 1, is_in_ring: true }),
      entry({ id: 'b', armbandNumber: '22', runOrder: 2 }),
    ]);

    expect(preview.inRingArmband).toBe('11');
    expect(preview.nextArmbands).toEqual(['22']);
  });

  it('drops entries with no usable armband from the preview list', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'a', armband: '  ', runOrder: 1 }),
      entry({ id: 'b', armband: '20', runOrder: 2 }),
    ]);

    expect(preview.nextArmbands).toEqual(['20']);
    // Still counted as remaining — it is a real dog, just missing an armband.
    expect(preview.remaining).toBe(2);
  });

  // MYK9-645 round 4: the queue's membership list had drifted from the counting
  // rule by exactly `moved` and `not_accepted`, so a class with an unscored
  // `moved` #114 beside a live #115 announced "Next up 114, 115" and
  // "1 of 1 remaining" -- while #114 was simultaneously listed under Not
  // running. Both now answer to `isExpectedEntry`.
  it('leaves a moved entry out of the order as well as the counts', () => {
    const rows: ReplicatedEntry[] = [
      entry({
        id: 'moved',
        armband: '114',
        runOrder: 1,
        entryStatus: 'moved',
        checkInStatus: 'no-status',
        isScored: false,
      }),
      entry({
        id: 'live',
        armband: '115',
        runOrder: 2,
        entryStatus: 'confirmed',
        checkInStatus: 'no-status',
        isScored: false,
      }),
    ];
    const preview = buildNextUpPreview(rows);

    expect(preview.nextArmbands).toEqual(['115']);
    expect(preview.remaining).toBe(1);
    expect(preview.total).toBe(1);
    // The same row the order now skips is the one the grouping calls not_running.
    expect(classifyEntries(rows)['moved']).toBe('not_running');
  });

  it('leaves a not_accepted entry out of the order as well as the counts', () => {
    const preview = buildNextUpPreview([
      entry({ id: 'na', armband: '200', runOrder: 1, entryStatus: 'not_accepted' }),
      entry({ id: 'live', armband: '201', runOrder: 2, entryStatus: 'confirmed' }),
    ]);

    expect(preview.nextArmbands).toEqual(['201']);
    expect(preview.total).toBe(1);
  });

  // MYK9-645 round 5, sibling branch (a): an unscored row with an `absent`
  // RESULT is ACCOUNTED -- out of remaining and out of the numerator's work --
  // yet it stayed in the ORDER, so the card offered #7 as next up in a class
  // the counts already called finished.
  it('leaves an unscored absent-result row out of the order, as the counts already do', () => {
    const rows: ReplicatedEntry[] = [
      entry({ id: 'scored', armband: '1', runOrder: 1, entryStatus: 'confirmed', isScored: true }),
      entry({
        id: 'absent',
        armband: '7',
        runOrder: 2,
        entryStatus: 'confirmed',
        isScored: false,
        resultStatus: 'absent',
      }),
    ];
    const preview = buildNextUpPreview(rows);

    expect(preview.nextArmbands).toEqual([]);
    // Both rows are expected and both are accounted: 2 of 2 done, 0 remaining.
    expect(preview.total).toBe(2);
    expect(preview.remaining).toBe(0);
    expect(classifyEntries(rows)['absent']).toBe('completed');
    // The chip row a judge taps after a save must not offer it either.
    expect(toQuickAdvanceChips(rows, { excludeEntryId: 'scored' })).toEqual([]);
  });

  // Sibling branch (b): a stale `check_in_status: 'in-ring'` on a row the show
  // no longer expects (staging `entries.94db1b95`) announced it as the dog in
  // the ring while it was listed under Not running. It escaped the browser walk
  // only because its armband is NULL.
  it('never announces a withdrawn row as in the ring, however its check-in reads', () => {
    const rows: ReplicatedEntry[] = [
      entry({
        id: 'stale-in-ring',
        armband: '50',
        runOrder: 1,
        entryStatus: 'withdrawn',
        checkInStatus: 'in-ring',
        isScored: false,
      }),
      entry({
        id: 'live',
        armband: '51',
        runOrder: 2,
        entryStatus: 'confirmed',
        checkInStatus: 'checked-in',
        isScored: false,
      }),
    ];
    const preview = buildNextUpPreview(rows);

    expect(preview.inRingArmband).toBeNull();
    expect(preview.nextArmbands).toEqual(['51']);
    expect(preview.total).toBe(1);
    expect(preview.remaining).toBe(1);
    expect(classifyEntries(rows)['stale-in-ring']).toBe('not_running');
  });

  it('returns an empty preview for a class with no entries', () => {
    const preview = buildNextUpPreview([]);
    expect(preview).toEqual({ inRingArmband: null, nextArmbands: [], remaining: 0, total: 0 });
    expect(isEmptyNextUpPreview(preview)).toBe(true);
  });
});

describe('isLiveNextUpStatus', () => {
  it('shows the line only for live statuses', () => {
    expect(isLiveNextUpStatus('briefing')).toBe(true);
    expect(isLiveNextUpStatus('in-progress')).toBe(true);
    expect(isLiveNextUpStatus('offline-scoring')).toBe(true);
    expect(isLiveNextUpStatus('no-status')).toBe(false);
    expect(isLiveNextUpStatus('start_time')).toBe(false);
    expect(isLiveNextUpStatus('completed')).toBe(false);
    expect(isLiveNextUpStatus('setup')).toBe(false);
    expect(isLiveNextUpStatus('break')).toBe(false);
  });
});

describe('selectNextUpForCard', () => {
  const idle: AtShowNextUpPreview = {
    inRingArmband: null,
    nextArmbands: [],
    remaining: 2,
    total: 2,
  };
  const waiting: AtShowNextUpPreview = {
    inRingArmband: null,
    nextArmbands: ['7'],
    remaining: 1,
    total: 3,
  };
  const running: AtShowNextUpPreview = {
    inRingArmband: '5',
    nextArmbands: ['9'],
    remaining: 2,
    total: 4,
  };

  it('prefers the paired class that actually has a dog in the ring', () => {
    const map = new Map([
      ['a', waiting],
      ['b', running],
    ]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(running);
  });

  it('falls back to the first class with dogs waiting', () => {
    const map = new Map([
      ['a', idle],
      ['b', waiting],
    ]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(waiting);
  });

  it('falls back to the first known preview so counts still render', () => {
    const map = new Map([['a', idle]]);
    expect(selectNextUpForCard(['a', 'b'], map)).toBe(idle);
  });

  it('returns undefined when no class id is known', () => {
    expect(selectNextUpForCard(['zz'], new Map())).toBeUndefined();
    expect(isEmptyNextUpPreview(undefined)).toBe(true);
  });
});
