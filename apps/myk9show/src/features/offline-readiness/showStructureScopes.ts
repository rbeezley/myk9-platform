import { countCoveredRows, countServerBackedRows } from '@myk9/replication';
import {
  replicatedClassesTable,
  replicatedJudgeAssignmentsTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { readJudgeAssignmentsOrThrow } from '@/services/database/judges/assignmentReads';
import type { ScopeReadiness } from './computeOfflineReadiness';

export interface ScopedMeta {
  totalRows?: number;
  expectedRemoteRows?: number;
  lastIncrementalSyncAt?: number;
}

/**
 * A scope counts as hydrated only when its server-derived expected row count is
 * known and every expected row is present locally. The older local-only
 * `totalRows` value is intentionally not sufficient: quota eviction can
 * rewrite it downward and make a partial replica look complete. Callers pass
 * the rows the device accounts for (`countCoveredRows`): never a pending local
 * create, which would hide an evicted row (MYK9-752), and always a row deleted
 * here whose DELETE is still queued, which the server still counts (MYK9-762).
 */
export function toScope(
  label: string,
  meta: ScopedMeta | null,
  localRowCount: number
): ScopeReadiness {
  const hydrated =
    meta?.expectedRemoteRows !== undefined && localRowCount >= meta.expectedRemoteRows;
  return {
    label,
    hydrated,
    lastSyncAt: hydrated ? meta?.lastIncrementalSyncAt || null : null,
  };
}

export interface ShowStructureScopes {
  show: ScopeReadiness;
  trials: ScopeReadiness;
  classes: ScopeReadiness;
}

/**
 * Is the show's structure (its row, every trial, every trial's classes) whole
 * on this device? Shared by the offline-ready badge and the desk's offline
 * capacity check (MYK9-788), which counts a judge-day across classes the
 * desk never selected. A failed device read throws.
 */
export async function gatherShowStructureScopes(showId: string): Promise<ShowStructureScopes> {
  const [trialsMeta, trialRows, showRow] = await Promise.all([
    replicatedTrialsTable.getSyncMetadata(showId) as Promise<ScopedMeta | null>,
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedShowsTable.getShowById(showId),
  ]);
  // Read after the rows, so a delete landing in between is still counted once.
  const trialDeletes = await replicatedTrialsTable.pendingDeletes.coveredIds(showId);
  const trials = toScope('trials', trialsMeta, countCoveredRows(trialRows, trialDeletes));
  // The show row itself is load-bearing offline — /at-show/:showId reads
  // replicatedShowsTable.getShowById. Shows sync is CLUB-scoped, so check
  // row presence directly rather than a per-show watermark.
  const show: ScopeReadiness = { label: 'show', hydrated: showRow !== null, lastSyncAt: null };

  // Classes are scoped by TRIAL id, so a truthful per-show answer fans out
  // over the show's trials — every trial's classes must be hydrated. Until the
  // trials scope itself is hydrated the fan-out is unknowable: report cold.
  if (!trials.hydrated) {
    return { show, trials, classes: { label: 'classes', hydrated: false, lastSyncAt: null } };
  }
  const perTrial = await Promise.all(
    trialRows.map(async trial => {
      const [classMeta, classRows] = await Promise.all([
        replicatedClassesTable.getSyncMetadata(trial.id) as Promise<ScopedMeta | null>,
        replicatedClassesTable.getClassesByTrial(trial.id),
      ]);
      return toScope('classes', classMeta, countServerBackedRows(classRows));
    })
  );
  const allHydrated = perTrial.every(scope => scope.hydrated);
  const watermarks = perTrial.map(scope => scope.lastSyncAt).filter((t): t is number => t !== null);
  return {
    show,
    trials,
    classes: {
      label: 'classes',
      hydrated: allHydrated,
      lastSyncAt: allHydrated && watermarks.length > 0 ? Math.min(...watermarks) : null,
    },
  };
}

/** The judge-assignments table (global scope) holds every row the server expects. */
export function isJudgeAssignmentsTableHydrated(
  meta: ScopedMeta | null,
  rows: Parameters<typeof countServerBackedRows>[0] | null
): boolean {
  return (
    rows !== null &&
    meta?.expectedRemoteRows !== undefined &&
    countServerBackedRows(rows) >= meta.expectedRemoteRows
  );
}

export interface ShowStructureCoverage {
  show: boolean;
  trials: boolean;
  classes: boolean;
  assignments: boolean;
}

/**
 * Everything a judge-day count reads besides entries: the show's structure and
 * the judge-assignments table. A failed device read throws.
 */
export async function showStructureCoverage(showId: string): Promise<ShowStructureCoverage> {
  const [structure, assignmentsMeta, assignmentRows] = await Promise.all([
    gatherShowStructureScopes(showId),
    replicatedJudgeAssignmentsTable.getSyncMetadata() as Promise<ScopedMeta | null>,
    readJudgeAssignmentsOrThrow(),
  ]);
  return {
    show: structure.show.hydrated,
    trials: structure.trials.hydrated,
    classes: structure.classes.hydrated,
    assignments: isJudgeAssignmentsTableHydrated(assignmentsMeta, assignmentRows),
  };
}
