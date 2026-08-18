import type { ReplicatedEntry } from '@/services/replication';

export interface JudgeEntryCounts {
  totalEntries: number;
  checkedInEntries: number;
  completedEntries: number;
}

/**
 * Derive judge-facing progress from the canonical entry rows. Class snapshots
 * are intentionally not used here: they lag behind ringside scoring updates.
 */
export function deriveJudgeEntryCounts(entries: readonly ReplicatedEntry[]): JudgeEntryCounts {
  const activeEntries = entries.filter(entry => !entry.deletedAt && !entry.deleted_at);
  return {
    totalEntries: activeEntries.length,
    checkedInEntries: activeEntries.filter(
      entry => entry.checkInStatus === 'checked-in' || entry.check_in_status === 'checked-in'
    ).length,
    completedEntries: activeEntries.filter(
      entry => entry.isScored === true || entry.is_scored === true
    ).length,
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
