import { getReportById } from '@/lib/reports/reportRegistry';

import { mergeReportPdfs } from '../mergeReportPdfs';
import type { CollatedTrialPacket, TrialPacketJudge } from './collateTrialPacket';
import { PACKET_REPORT_IDS } from './packetReports';
import { buildJudgeCoverModel, renderJudgeCoverPdf } from './judgeCoverSheet';

/** One class's sheets: the very output the single-class print builds for that class. */
export function buildClassSheetParts(
  judgeClass: TrialPacketJudge['classes'][number]
): Uint8Array[] {
  return PACKET_REPORT_IDS.map(reportId => {
    const report = getReportById(reportId);
    const bytes = report?.buildPdf?.(judgeClass.dataSet, report.defaultSort ?? 'run-order');
    if (!bytes) throw new Error(`${reportId} cannot be built as a PDF`);
    return bytes;
  });
}

/** The cover sheet, then each class's check-in sheet and scoresheets, as one PDF. */
export async function buildJudgePacketPdf(
  packet: CollatedTrialPacket,
  judge: TrialPacketJudge,
  showName: string
): Promise<Uint8Array> {
  const cover = renderJudgeCoverPdf(buildJudgeCoverModel(packet, judge, showName));
  return mergeReportPdfs([cover, ...judge.classes.flatMap(buildClassSheetParts)]);
}
