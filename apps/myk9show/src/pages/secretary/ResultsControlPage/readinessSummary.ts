import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';

export interface ResultsReadinessSummary {
  totalClasses: number;
  totalEntries: number;
  unscoredEntries: number;
  unreleasedClasses: number;
  safeToSend: boolean;
}

/**
 * `entries.result_status` values that mean the entry is settled.
 *
 * The column is `DEFAULT 'pending'` with
 * `CHECK (result_status IN ('pending','qualified','nq','absent','excused','withdrawn'))`,
 * so a merely non-empty `result_status` proves nothing — every untouched entry
 * carries `'pending'`. Only these terminal values resolve an entry.
 *
 * This is an allowlist on purpose: an unrecognised value leaves the entry
 * counted as outstanding, which blocks closeout visibly. A denylist would let a
 * status added later silently report a show as ready to send.
 */
const TERMINAL_RESULT_STATUSES = new Set(['qualified', 'nq', 'absent', 'excused', 'withdrawn']);

/**
 * Scoring facts as the replication mapper produces them.
 *
 * This is the only check that fires for real show data. `is_scored` is set by
 * scoring; the terminal statuses cover entries resolved without a score
 * (absent, excused, withdrawn), which are equally "not outstanding".
 */
function hasReplicatedResult(entry: SyncableEntryData): boolean {
  if (entry.isScored === true) return true;

  return TERMINAL_RESULT_STATUSES.has(
    String(entry.resultStatus ?? '')
      .trim()
      .toLowerCase()
  );
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
