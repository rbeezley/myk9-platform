import type { SyncableClassData, SyncableEntryData } from '@/store/classStore';
import { isAccountedFor, isExpectedEntry } from '@/features/_shared/entryAccounting';

export interface ResultsReadinessSummary {
  totalClasses: number;
  totalEntries: number;
  unscoredEntries: number;
  unreleasedClasses: number;
  /**
   * There are classes but no entries for them, so scoring completeness cannot
   * be judged. Not the same as "everything is scored".
   */
  entriesUncorroborated: boolean;
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

  /**
   * Classes are present but not one entry belongs to them.
   *
   * `classes` and `entries` arrive from two INDEPENDENT replication
   * subscriptions, and `ReplicatedTableQuery.getAll()` returns `[]` for every
   * failure including its own timeout (MYK9-252). So this state is reached
   * either mid-hydration or on a swallowed read error -- and in both,
   * `unscoredEntries` is 0 because there are no entries to be unscored, not
   * because everything is scored.
   *
   * With `results_released_at` already stamped, that used to satisfy
   * `safeToSend` and the page told the secretary results were "released and
   * ready to submit" for a show with unscored entries. A show with genuinely
   * zero entries has nothing to submit either, so refusing to vouch is the
   * right answer in both readings.
   *
   * This deliberately does NOT also require `classes.length > 0`. Both stores
   * come through `getAll()`, which returns `[]` for every failure, so a doubly
   * failed read looks exactly like an empty show -- and gating on classes let
   * that case fall through to a confident verdict over three zeros.
   */
  const entriesUncorroborated = relevantEntries.length === 0;

  return {
    totalClasses: classes.length,
    totalEntries: relevantEntries.length,
    unscoredEntries,
    unreleasedClasses,
    entriesUncorroborated,
    safeToSend:
      classes.length > 0 &&
      !entriesUncorroborated &&
      unscoredEntries === 0 &&
      unreleasedClasses === 0,
  };
}
