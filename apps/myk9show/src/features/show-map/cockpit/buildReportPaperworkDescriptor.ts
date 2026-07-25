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
        status: row.status,
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
      selected.map(entry => ({
        entryId: entry.id,
        classId: entry.class_id ?? '',
        dogId: entry.dog_id ?? '',
        armband: entry.armband == null ? null : Number(entry.armband),
        resultStatus: entry.result_status,
        placement: entry.final_placement,
        searchTimeSeconds: entry.search_time_seconds,
        totalFaults: entry.total_faults,
        trialId: classById.get(entry.class_id ?? '')?.trial_id ?? undefined,
      })),
      classFacts
    );
  }

  return null;
}
