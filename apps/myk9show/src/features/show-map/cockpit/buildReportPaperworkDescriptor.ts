import type { DbClass, DbEntry } from '@/types/database-mappings';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { ReportScope } from '@/lib/reports/types';

import {
  buildPaperworkClassFacts,
  paperworkEntryInScope,
} from '../../../../../../supabase/functions/_shared/paperwork/rowDescriptors.ts';
import { withPaperworkJudge } from './paperworkClassJudge';
import {
  buildPrintedSheetDescriptor,
  hasPrintedEntries,
  isPrintedSheetReportId,
  type PrintedSheetRows,
} from './printedSheetDescriptor';
import { buildResultPaperworkDescriptor, type PaperworkDescriptor } from './paperworkPrintState';

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
  /** `show.assignedJudges`: the sheet's judge fallback, so the fingerprint hashes the printed name. */
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> | undefined;
  /**
   * The check-in sheet and scoresheet hash what they print, from the rows the PDF is built from
   * (MYK9-2103); without them those two reports have no descriptor. The results reports read
   * `classes` and `entries`.
   */
  printedSheets?: PrintedSheetRows | undefined;
  /**
   * Keep a check-in/scoresheet descriptor whose class has no printable entries left (class
   * subjects only). Read-only status surfaces set it, so a print of dogs that have since left
   * reads changed; anything that RECORDS a print leaves it off and gets null, as there is no
   * sheet to record (MYK9-2103).
   */
  keepEmptySheet?: boolean;
}): PaperworkDescriptor | null {
  if (isPrintedSheetReportId(input.reportId)) {
    if (!input.printedSheets) return null;
    const descriptor = buildPrintedSheetDescriptor({
      reportId: input.reportId,
      scope: input.scope,
      rows: input.printedSheets,
      assignedJudges: input.assignedJudges,
    });
    return descriptor && (input.keepEmptySheet || hasPrintedEntries(descriptor))
      ? descriptor
      : null;
  }
  const classes = withPaperworkJudge(input.classes, input.assignedJudges);
  const selected = input.entries.filter(entry =>
    paperworkEntryInScope(entry, input.scope, classes)
  );
  if (selected.length === 0) return null;
  const classById = new Map(classes.map(classItem => [classItem.id, classItem] as const));
  const classFacts = buildPaperworkClassFacts(selected, classById);

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
