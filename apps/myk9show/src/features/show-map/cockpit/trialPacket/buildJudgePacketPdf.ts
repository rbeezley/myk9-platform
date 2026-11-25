import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { getTrialTimezone } from '@/features/registries';
import { getReportById } from '@/lib/reports/reportRegistry';

import { assembleJudgePacketPdf } from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketPdf.ts';
import type { CollatedTrialPacket, TrialPacketJudge } from './collateTrialPacket';
import { PACKET_REPORT_IDS } from './packetReports';

/** One class's sheets: the very output the single-class print builds for that class. */
export function buildClassSheetParts(
  judgeClass: TrialPacketJudge['classes'][number]
): Uint8Array[] {
  // A class whose dogs all sit out has a check-in sheet and no scoresheet (MYK9-2387).
  const reportIds = PACKET_REPORT_IDS.filter(
    reportId => reportId !== 'scoresheet' || judgeClass.scoreSheetPages > 0
  );
  return reportIds.map(reportId => {
    const report = getReportById(reportId);
    const bytes = report?.buildPdf?.(judgeClass.dataSet, report.defaultSort ?? 'run-order');
    if (!bytes) throw new Error(`${reportId} cannot be built as a PDF`);
    return bytes;
  });
}

/** The cover sheet, then each class's sheets, as one PDF with the packet footer on every page. */
export function buildJudgePacketPdf(
  packet: CollatedTrialPacket,
  judge: TrialPacketJudge,
  showName: string,
  printedAt: Date = new Date()
): Promise<Uint8Array> {
  return assembleJudgePacketPdf({
    pdfLib: { PDFDocument, StandardFonts, rgb },
    JsPdf: jsPDF,
    packet,
    judge,
    showName,
    classParts: judge.classes.flatMap(buildClassSheetParts),
    printedAt,
    timeZone: getTrialTimezone(packet.trial),
  });
}
