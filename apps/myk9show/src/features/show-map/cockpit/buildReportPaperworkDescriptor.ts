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
      }))
    );
  }

  if (input.reportId === 'scoresheet') {
    const classId = input.scope.kind === 'class' ? input.scope.classId : null;
    const selectedClass = classId
      ? input.classes.find(classItem => classItem.id === classId)
      : undefined;
    return buildScoreSheetPaperworkDescriptor(
      input.scope,
      selected.map(entry => ({
        entryId: entry.id,
        classId: entry.class_id ?? '',
        dogId: entry.dog_id ?? '',
        armband: entry.armband == null ? null : Number(entry.armband),
        runOrder: entry.run_order,
        checkInStatus: entry.check_in_status,
        section: selectedClass?.section ?? null,
      })),
      selectedClass
        ? {
            timeLimitSeconds: selectedClass.time_limit_seconds,
            areaCount: selectedClass.num_areas,
            hides: selectedClass.num_hides,
          }
        : { selection: input.scope.kind }
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
      }))
    );
  }

  return null;
}
