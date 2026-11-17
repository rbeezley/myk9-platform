import type { User } from '@supabase/supabase-js';

import type { DbClass, DbEntry } from '@/types/database-mappings';

import type { ShowJudgeAssignment } from '@/types/judge-types';
import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';
import { recordPaperworkPrinted } from '../paperworkPrintActions';
import { isEmptyDescriptor, type PrintedSheetRows } from '../printedSheetDescriptor';
import { PACKET_REPORT_IDS } from './packetReports';

export interface TrialPacketPrintRecords {
  /** Print records written: one per class per sheet kind, the same ones a class print writes. */
  recordIds: string[];
  /** Classes that now read printed on their own card. */
  classCount: number;
  /** Classes whose record could not be written. */
  failedClassIds: string[];
}

/**
 * A trial print marks each class in it printed: the same per-class records the class's own Print
 * writes (class scope, the same fingerprint), so the class card and the Reports tab read them.
 * A failure on one class never stops the rest.
 */
export async function recordTrialPacketPrint(input: {
  showId: string;
  trialId: string;
  classIds: readonly string[];
  classes: readonly DbClass[];
  entries: readonly DbEntry[];
  /** The rows the check-in sheet and scoresheet print from (MYK9-2103). */
  printedSheets: PrintedSheetRows;
  user: User;
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> | undefined;
}): Promise<TrialPacketPrintRecords> {
  const recordIds: string[] = [];
  const failedClassIds: string[] = [];
  let classCount = 0;
  for (const classId of input.classIds) {
    const scope = {
      kind: 'class' as const,
      showId: input.showId,
      trialId: input.trialId,
      classId,
    };
    let wrote = false;
    try {
      for (const reportId of PACKET_REPORT_IDS) {
        const descriptor = buildReportPaperworkDescriptor({
          reportId,
          scope,
          classes: input.classes,
          entries: input.entries,
          assignedJudges: input.assignedJudges,
          printedSheets: input.printedSheets,
        });
        if (!descriptor || isEmptyDescriptor(descriptor)) continue;
        const record = await recordPaperworkPrinted({
          descriptor,
          user: input.user,
          undoReason: 'Undid print record',
          undoFailureMessage: 'Could not undo that. The sheet is still marked printed.',
        });
        recordIds.push(record.id);
        wrote = true;
      }
    } catch {
      failedClassIds.push(classId);
      continue;
    }
    if (wrote) classCount += 1;
  }
  return { recordIds, classCount, failedClassIds };
}
