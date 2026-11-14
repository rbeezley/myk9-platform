import { getTrialTimezone } from '@/features/registries';
import { getReportById } from '@/lib/reports/reportRegistry';

import { mergeReportPdfs } from '../mergeReportPdfs';
import type { CollatedTrialPacket, TrialPacketJudge } from './collateTrialPacket';
import { stampPacketFooter } from './packetFooter';
import { buildJudgeCoverModel, renderJudgeCoverPdf } from './judgeCoverSheet';

/** The reports a before-trial packet holds for each class, in print order. */
export const PACKET_REPORT_IDS = ['check-in-sheet', 'scoresheet'] as const;

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

/** The cover sheet, then each class's sheets, as one PDF with the packet footer on every page. */
export async function buildJudgePacketPdf(
  packet: CollatedTrialPacket,
  judge: TrialPacketJudge,
  showName: string,
  printedAt: Date = new Date()
): Promise<Uint8Array> {
  const cover = renderJudgeCoverPdf(buildJudgeCoverModel(packet, judge, showName));
  const merged = await mergeReportPdfs([cover, ...judge.classes.flatMap(buildClassSheetParts)]);
  return stampPacketFooter(
    merged,
    judge.judgeName ?? 'No judge assigned',
    printedAt,
    getTrialTimezone(packet.trial)
  );
}
