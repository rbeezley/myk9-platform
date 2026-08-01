import { describe, expect, it } from 'vitest';
import { buildJudgeEntryCountsByClass, deriveJudgeEntryCounts } from './judgeEntryCounts';
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
