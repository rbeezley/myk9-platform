import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';

export interface ResultsReadinessSummary {
  totalClasses: number;
  totalEntries: number;
  unscoredEntries: number;
  unreleasedClasses: number;
  safeToSend: boolean;
}

/**
 * Scoring facts as the replication mapper produces them.
 *
 * This is the only check that fires for real show data. `is_scored` is set by
 * scoring; `result_status` covers entries resolved without a score (absent,
 * excused, withdrawn), which are equally "not outstanding" for closeout.
 */
function hasReplicatedResult(entry: SyncableEntryData): boolean {
  return entry.isScored === true || String(entry.resultStatus ?? '').trim() !== '';
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

function hasResult(entry: SyncableEntryData): boolean {
  return hasReplicatedResult(entry) || hasLocalResult(entry);
}

export function buildResultsReadinessSummary(
  classes: SyncableClassData[],
  entries: SyncableEntryData[]
): ResultsReadinessSummary {
  const classIds = new Set(classes.map(cls => cls.id));
  const relevantEntries = entries.filter(entry => classIds.has(entry.classId));
  const unscoredEntries = relevantEntries.filter(entry => !hasResult(entry)).length;
  const unreleasedClasses = classes.filter(cls => !cls.results_released_at).length;

  return {
    totalClasses: classes.length,
    totalEntries: relevantEntries.length,
    unscoredEntries,
    unreleasedClasses,
    safeToSend: classes.length > 0 && unscoredEntries === 0 && unreleasedClasses === 0,
  };
}
