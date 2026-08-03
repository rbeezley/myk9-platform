import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';
import { isAccountedFor, isExpectedEntry } from '@/features/_shared/entryAccounting';

export interface ResultsReadinessSummary {
  totalClasses: number;
  totalEntries: number;
  unscoredEntries: number;
  unreleasedClasses: number;
  safeToSend: boolean;
}

/**
 * The local/mock entry shape, where a result is typed straight onto the entry.
 * `entries` has no `status` column and `replicatedToEntry` blanks the display
 * trio, so none of these fields are ever populated from the database — this
 * branch exists only for locally-authored and seeded-mock entries.
 */
function hasLocalResult(entry: SyncableEntryData): boolean {
  const status = String(entry.status ?? '')
    .trim()
    .toLowerCase();

  return (
    Boolean(entry.score || entry.time || entry.placement) ||
    (status !== '' && status !== 'pending' && status !== 'no result')
  );
}

/**
 * Outstanding = the show still expects this entry to run, and it has no result.
 *
 * Both halves come from `entryAccounting`, the same rules the server uses to
 * derive class completion. Deciding this locally is how the page ends up
 * disagreeing with the server about whether a show is finished.
 */
function isOutstanding(entry: SyncableEntryData): boolean {
  if (!isExpectedEntry(entry)) return false;

  return !isAccountedFor(entry) && !hasLocalResult(entry);
}

export function buildResultsReadinessSummary(
  classes: SyncableClassData[],
  entries: SyncableEntryData[]
): ResultsReadinessSummary {
  const classIds = new Set(classes.map(cls => cls.id));
  const relevantEntries = entries.filter(entry => classIds.has(entry.classId));
  const unscoredEntries = relevantEntries.filter(isOutstanding).length;
  const unreleasedClasses = classes.filter(cls => !cls.results_released_at).length;

  return {
    totalClasses: classes.length,
    totalEntries: relevantEntries.length,
    unscoredEntries,
    unreleasedClasses,
    safeToSend: classes.length > 0 && unscoredEntries === 0 && unreleasedClasses === 0,
  };
}
