import type { ReportDbEntry, ReportScope } from '@/lib/reports/types';
import {
  buildPacketClasses,
  buildPacketEntries,
  buildPacketTrials,
} from '@/pages/secretary/ReportsPage/buildPacketData';
import type { DbClass, DbTrial } from '@/types/database-mappings';
import type { ShowJudgeAssignment } from '@/types/judge-types';

import {
  buildSheetDescriptorFromPrinted,
  isPrintedSheetReportId,
} from '../../../../../../supabase/functions/_shared/paperwork/printedSheet.ts';
import type { PaperworkDescriptor } from './paperworkPrintState';

/** The rows a printed sheet (check-in sheet, scoresheet) is built from: the PDF's own source. */
export interface PrintedSheetRows {
  trials: readonly DbTrial[];
  classes: readonly DbClass[];
  entries: readonly ReportDbEntry[];
}

export { isPrintedSheetReportId };

/**
 * The check-in sheet or scoresheet fingerprint of `rows`: exactly the input the renderer gets
 * (`buildPacket*`, the same functions the PDF is built with), so every surface that reads the rows
 * the way Reports does hashes the same printed text (MYK9-2103).
 */
export function buildPrintedSheetDescriptor(input: {
  reportId: string;
  scope: ReportScope;
  rows: PrintedSheetRows;
  /** `show.assignedJudges`: the printed judge's fallback. */
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> | undefined;
}): PaperworkDescriptor | null {
  const { rows } = input;
  const judges = input.assignedJudges ?? [];
  return buildSheetDescriptorFromPrinted({
    reportId: input.reportId,
    scope: input.scope,
    trials: buildPacketTrials(rows.trials),
    classes: buildPacketClasses(rows.classes, judges),
    entries: buildPacketEntries(rows.entries, rows.trials, rows.classes, judges),
  });
}
