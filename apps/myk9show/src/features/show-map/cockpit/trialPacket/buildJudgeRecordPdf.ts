import { jsPDF } from 'jspdf';

import { mergeReportPdfs } from '../mergeReportPdfs';
import { judgeRecordSummary, type JudgeRecord } from './judgeRecord';
import { stampPacketFooter } from './packetFooter';
import { renderReviewPages, reviewVerb } from './renderJudgeReviewPdf';

const MARGIN = 18;
const PAGE_WIDTH = 215.9;
const RIGHT = PAGE_WIDTH - MARGIN;

/** What the cover says about the file. The plan words it; the signed paper is the official record. */
export const JUDGE_RECORD_COPY_LINE =
  'This is a convenience copy. The signed paper is the official record.';
export const JUDGE_RECORD_KEEP_LINE = 'Keep this file for one year.';

/** The cover: whose record, which day, and the trials and classes in it. */
export function renderJudgeRecordCover(record: JudgeRecord, showName: string): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text("Judge's record", MARGIN, y);
  y += 10;
  doc.setFontSize(14);
  doc.text(doc.splitTextToSize(judgeRecordSummary(record), PAGE_WIDTH - MARGIN * 2), MARGIN, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(showName, MARGIN, y);
  y += 14;
  doc.setFontSize(11);
  for (const line of [JUDGE_RECORD_COPY_LINE, JUDGE_RECORD_KEEP_LINE]) {
    doc.text(line, MARGIN, y);
    y += 7;
  }
  y += 5;
  for (const section of record.sections) {
    doc.setFont('helvetica', 'bold');
    doc.text(section.trialLabel || 'Trial', MARGIN, y);
    y += 2;
    doc.line(MARGIN, y, RIGHT, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    for (const item of section.classes) {
      doc.text(item.name, MARGIN + 4, y, { maxWidth: RIGHT - MARGIN - 30 });
      doc.text(`${item.pages.length} ${item.pages.length === 1 ? 'page' : 'pages'}`, RIGHT, y, {
        align: 'right',
      });
      y += 7;
    }
    y += 4;
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * A judge's record for one day: the cover, then each trial's classes (every class starts on a new
 * page, so each trial does too), with the scores as they stand and any score changed after the
 * judge submitted it marked. The packet footer is on every page. pdf-lib is imported by this
 * module's callers on demand only.
 */
export async function buildJudgeRecordPdf(
  record: JudgeRecord,
  showName: string,
  timeZone: string,
  printedAt: Date = new Date()
): Promise<Uint8Array> {
  const cover = renderJudgeRecordCover(record, showName);
  const pages = renderReviewPages(record.review, reviewVerb(record.registryId), false);
  const merged = await mergeReportPdfs([cover, pages]);
  return stampPacketFooter(merged, record.judgeName, printedAt, timeZone);
}
