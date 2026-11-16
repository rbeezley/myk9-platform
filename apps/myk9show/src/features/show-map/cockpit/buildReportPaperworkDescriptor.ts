import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ReportScope } from '@/lib/reports/types';

import {
  buildCheckInPaperworkDescriptor,
  buildResultPaperworkDescriptor,
  buildScoreSheetPaperworkDescriptor,
  type PaperworkDescriptor,
} from './paperworkPrintState';

function entryInScope(entry: DbEntry, scope: ReportScope, classes: readonly DbClass[]): boolean {
  if (scope.kind === 'class') return entry.class_id === scope.classId;
  if (scope.kind === 'trial') {
    const classIds = new Set(
      classes
        .filter(classItem => classItem.trial_id === scope.trialId)
        .map(classItem => classItem.id)
    );
    return entry.class_id !== null && classIds.has(entry.class_id);
  }
  return true;
}

/**
 * A NUMERIC column reaches this file as a number from one read path and as its text from another
 * (Reports reads `mapReplicatedEntryToDbRow` rows as stored; Results and Overview read
 * `toSecretaryEntry` rows, which coerce). The fingerprint hashes the facts' text, so `"42.31"` and
 * `42.31` would make a just-recorded print read as stale on the other page (MYK9-1031).
 */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildReportPaperworkDescriptor(input: {
  reportId: string;
  scope: ReportScope;
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
}): PaperworkDescriptor | null {
  const selected = input.entries.filter(entry => entryInScope(entry, input.scope, input.classes));
  if (selected.length === 0) return null;
  const classById = new Map(input.classes.map(classItem => [classItem.id, classItem] as const));
  const selectedClasses = [...new Set(selected.map(entry => entry.class_id).filter(Boolean))]
    .map(classId => classById.get(classId as string))
    .filter((classItem): classItem is DbClass => Boolean(classItem));
  const classFacts = selectedClasses.map(classItem => {
    const row = classItem as DbClass & Record<string, unknown>;
    return {
      classId: classItem.id,
      trialId: classItem.trial_id ?? '',
      facts: {
        classId: classItem.id,
        trialId: classItem.trial_id,
        element: classItem.element,
        level: classItem.level,
        section: classItem.section,
        // The check-in sheet and scoresheets do not print the class's own status, so starting or
        // finishing a class must not read as a change (MYK9-2074). The results sheet keeps it.
        ...(input.reportId === 'scoresheet' ? {} : { status: row.status }),
        judgeName: row.judge_name,
        timeLimitSeconds: classItem.time_limit_seconds,
        areaCount: classItem.num_areas,
        hides: classItem.num_hides,
      },
    };
  });

  if (input.reportId === 'check-in-sheet') {
    return buildCheckInPaperworkDescriptor(
      input.scope,
      selected.map(entry => ({
        entryId: entry.id,
        classId: entry.class_id ?? '',
        dogId: entry.dog_id ?? '',
        armband: entry.armband == null ? null : Number(entry.armband),
        runOrder: entry.run_order,
        checkInStatus: entry.check_in_status,
        entryStatus: entry.entry_status ?? null,
        trialId: classById.get(entry.class_id ?? '')?.trial_id ?? undefined,
      }))
    );
  }

  if (input.reportId === 'scoresheet') {
    return buildScoreSheetPaperworkDescriptor(
      input.scope,
      selected.map(entry => ({
        entryId: entry.id,
        classId: entry.class_id ?? '',
        dogId: entry.dog_id ?? '',
        armband: entry.armband == null ? null : Number(entry.armband),
        runOrder: entry.run_order,
        checkInStatus: entry.check_in_status,
        entryStatus: entry.entry_status ?? null,
        section: classById.get(entry.class_id ?? '')?.section ?? null,
        trialId: classById.get(entry.class_id ?? '')?.trial_id ?? undefined,
      })),
      classFacts
    );
  }

  if (input.reportId === 'results-sheet' || input.reportId === 'result-labels') {
    return buildResultPaperworkDescriptor(
      input.reportId,
      input.scope,
      selected.map(entry => {
        // Only the results sheet prints the element time; labels do not, so they ignore it.
        const elementTimeSeconds =
          input.reportId === 'results-sheet' ? numberOrNull(entry.element_time_seconds) : null;
        return {
          entryId: entry.id,
          classId: entry.class_id ?? '',
          dogId: entry.dog_id ?? '',
          armband: entry.armband == null ? null : Number(entry.armband),
          resultStatus: entry.result_status,
          placement: numberOrNull(entry.final_placement),
          searchTimeSeconds: numberOrNull(entry.search_time_seconds),
          ...(elementTimeSeconds !== null ? { elementTimeSeconds } : {}),
          totalFaults: numberOrNull(entry.total_faults),
          trialId: classById.get(entry.class_id ?? '')?.trial_id ?? undefined,
        };
      }),
      classFacts
    );
  }

  return null;
}
