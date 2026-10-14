import { describe, expect, it } from 'vitest';
import { buildJudgeEntryCountsByClass, deriveJudgeEntryCounts } from './judgeEntryCounts';
import { countEntryAccounting } from '@/features/_shared/entryAccounting';
import type { ReplicatedEntry } from '@/services/replication';

const entry = (overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry => ({
  id: crypto.randomUUID(),
  classId: 'class-1',
  showId: 'show-1',
  checkInStatus: 'no-status',
  isScored: false,
  ...overrides,
});

describe('judgeEntryCounts', () => {
  it('counts active entries, checked-in entries, and scored entries from canonical rows', () => {
    expect(
      deriveJudgeEntryCounts([
        entry(),
        entry({ checkInStatus: 'checked-in' }),
        entry({ isScored: true }),
        entry({ deletedAt: '2026-08-01T12:00:00Z', checkInStatus: 'checked-in', isScored: true }),
      ])
    ).toEqual({ totalEntries: 3, checkedInEntries: 1, completedEntries: 1 });
  });

  // MYK9-1166: Container Novice A, Oct 6. Ringside reads 0 / 2; the dashboard read 1/3.
  it('matches the ringside accounting for a class with a scratched + pulled + scored row', () => {
    const rows = [
      entry({ entryStatus: 'confirmed', checkInStatus: 'in-ring' }),
      entry({ entryStatus: 'confirmed', checkInStatus: 'no-status' }),
      entry({ entryStatus: 'scratched', checkInStatus: 'pulled', isScored: true }),
    ];
    const counts = deriveJudgeEntryCounts(rows);
    expect(counts).toEqual({ totalEntries: 2, checkedInEntries: 0, completedEntries: 0 });
    const ringside = countEntryAccounting(rows);
    expect(counts.totalEntries).toBe(ringside.expected);
    expect(counts.completedEntries).toBe(ringside.accounted);
  });

  it('excludes withdrawn entries and checked-in-but-pulled rows from every count', () => {
    expect(
      deriveJudgeEntryCounts([
        entry({ entryStatus: 'confirmed', checkInStatus: 'checked-in' }),
        entry({ entryStatus: 'withdrawn', checkInStatus: 'checked-in' }),
        entry({ entryStatus: 'withdrawn' }),
        entry({ entryStatus: 'scratched' }),
        entry({ entryStatus: 'confirmed', checkInStatus: 'pulled' }),
      ])
    ).toEqual({ totalEntries: 1, checkedInEntries: 1, completedEntries: 0 });
  });

  it('groups both camelCase and snake_case class IDs', () => {
    const counts = buildJudgeEntryCountsByClass([
      entry({ classId: 'class-1' }),
      entry({ classId: undefined, class_id: 'class-2', is_scored: true }),
    ]);

    expect(counts.get('class-1')).toEqual({
      totalEntries: 1,
      checkedInEntries: 0,
      completedEntries: 0,
    });
    expect(counts.get('class-2')).toEqual({
      totalEntries: 1,
      checkedInEntries: 0,
      completedEntries: 1,
    });
  });
});
