import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import type { TrialStats } from '@/components/shows/tabs/TrialsTab';

/**
 * Lane 3.7 — public/anon fallback for a *default*-style show's Trials/Classes
 * tabs.
 *
 * The trial-class store (`trialClasses`) is replication-fed and never syncs for
 * a logged-out guest, so a cold anon visitor who lands on the tabbed details UI
 * (default-style shows skip the marketing landing) sees empty Trials/Classes
 * tabs and 0 counts. When the store is cold we fetch classes per-trial via the
 * anon-safe `getClassesByTrialId` and reshape the PostgREST rows into the same
 * `ClassInfo` / `TrialStats` the warm store path produces.
 *
 * `classesByTrial` is the per-landing-trial fetch result: one entry per trial
 * holding that trial's raw PostgREST class rows.
 */
export interface TrialClassRows {
  trialId: string;
  rows: Record<string, unknown>[];
}

type EntryRow = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function judgeNameFromRow(row: Record<string, unknown>): string {
  const assignments = row.judge_assignments;
  if (!Array.isArray(assignments) || assignments.length === 0) return '';
  const first = assignments[0] as { people?: { first_name?: string; last_name?: string } };
  const people = first?.people;
  if (!people) return '';
  return `${people.first_name ?? ''} ${people.last_name ?? ''}`.trim();
}

function entryCountForClass(showEntries: EntryRow[], classId: string): number {
  return showEntries.filter(entry => entry.class_id === classId).length;
}

/**
 * Reshape per-trial PostgREST class rows into the `ClassInfo[]` the Classes tab
 * (and overview) render. Trial-level display fields come from `landingTrials`.
 */
export function buildPublicShowClasses(
  landingTrials: Trial[],
  classesByTrial: TrialClassRows[],
  showEntries: EntryRow[]
): ClassInfo[] {
  const rowsByTrialId = new Map(classesByTrial.map(entry => [entry.trialId, entry.rows]));
  const result: ClassInfo[] = [];

  for (const trial of landingTrials) {
    const rows = rowsByTrialId.get(trial.id) ?? [];
    for (const row of rows) {
      const element = str(row.element);
      const level = str(row.level);
      const id = str(row.id);
      result.push({
        id,
        name: `${element} ${level}`.trim(),
        element,
        level,
        section: str(row.section),
        judgeName: judgeNameFromRow(row),
        trialId: trial.id,
        time: str(row.start_time),
        ring: 0,
        status: normalizeClassStatus(str(row.status)),
        entryCount: entryCountForClass(showEntries, id),
        scoredCount: 0,
        userHasEntry: false,
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      });
    }
  }

  return result;
}

/** Apply the authenticated exhibitor's active-entry projection to cold public rows. */
export function markCurrentUserEntryClasses(
  classes: ClassInfo[],
  userEntryClassIds: ReadonlySet<string>
): ClassInfo[] {
  return classes.map(classInfo => ({
    ...classInfo,
    userHasEntry: userEntryClassIds.has(classInfo.id),
  }));
}

/**
 * Build the per-trial stat cards (class count, entry count, completed count)
 * from the same anon-safe class rows.
 */
export function buildPublicTrialStats(
  classesByTrial: TrialClassRows[],
  showEntries: EntryRow[]
): Record<string, TrialStats> {
  const stats: Record<string, TrialStats> = {};

  for (const { trialId, rows } of classesByTrial) {
    const classIds = new Set(rows.map(row => str(row.id)));
    const entryCount = showEntries.filter(entry =>
      classIds.has(str(entry.class_id))
    ).length;
    const completedClasses = rows.filter(
      row => normalizeClassStatus(str(row.status)) === CLASS_STATUS.COMPLETED
    ).length;
    stats[trialId] = {
      classCount: rows.length,
      entryCount,
      completedClasses,
    };
  }

  return stats;
}
