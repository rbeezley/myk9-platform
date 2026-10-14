import { countEntryAccounting, expectedEntries } from '@/features/_shared/entryAccounting';
import type { ReplicatedEntry } from '@/services/replication';

export interface JudgeEntryCounts {
  totalEntries: number;
  checkedInEntries: number;
  completedEntries: number;
}

/**
 * Derive judge-facing progress from the entry rows using the same canonical
 * accounting rule as the ringside class list (`countEntryAccounting`,
 * MYK9-645): withdrawn, scratched, pulled, moved and soft-deleted entries are
 * outside the denominator, and a pulled dog is never counted as judged even if
 * it carries a stale score (MYK9-1166). Class snapshots are intentionally not
 * used here: they lag behind ringside scoring updates.
 */
export function deriveJudgeEntryCounts(entries: readonly ReplicatedEntry[]): JudgeEntryCounts {
  const expected = expectedEntries([...entries]);
  const { accounted } = countEntryAccounting([...entries]);
  return {
    totalEntries: expected.length,
    checkedInEntries: expected.filter(
      entry => entry.checkInStatus === 'checked-in' || entry.check_in_status === 'checked-in'
    ).length,
    completedEntries: accounted,
  };
}

export function buildJudgeEntryCountsByClass(
  entries: readonly ReplicatedEntry[]
): Map<string, JudgeEntryCounts> {
  const grouped = new Map<string, ReplicatedEntry[]>();
  for (const entry of entries) {
    const classId = entry.classId ?? entry.class_id;
    if (!classId) continue;
    const classEntries = grouped.get(classId) ?? [];
    classEntries.push(entry);
    grouped.set(classId, classEntries);
  }

  return new Map(
    [...grouped.entries()].map(([classId, classEntries]) => [
      classId,
      deriveJudgeEntryCounts(classEntries),
    ])
  );
}
