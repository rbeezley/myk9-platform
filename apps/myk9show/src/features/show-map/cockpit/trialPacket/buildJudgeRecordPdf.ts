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

/** The cover flows onto further pages below this height, so no class is drawn off the sheet. */
export const COVER_BOTTOM = 262;
const ROW_GAP = 2;
const LINE_HEIGHT = 5;
const NAME_WIDTH = RIGHT - MARGIN - 4 - 28;

/**
 * The cover: whose record, which day, and the trials and classes in it. A long day's list flows
 * onto as many cover pages as it needs: each class name is measured wrapped, a trial's heading is
 * never left alone at the foot of a page, and a continued trial repeats its heading.
 */
export function renderJudgeRecordCover(record: JudgeRecord, showName: string): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text("Judge's record", MARGIN, y);
  y += 10;
  doc.setFontSize(14);
  const summary = doc.splitTextToSize(judgeRecordSummary(record), PAGE_WIDTH - MARGIN * 2);
  doc.text(summary, MARGIN, y);
  y += 9 + (summary.length - 1) * 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(showName, MARGIN, y, { maxWidth: PAGE_WIDTH - MARGIN * 2 });
  y += 14;
  doc.setFontSize(11);
  for (const line of [JUDGE_RECORD_COPY_LINE, JUDGE_RECORD_KEEP_LINE]) {
    doc.text(line, MARGIN, y);
    y += 7;
  }
  y += 5;

  const heading = (label: string, continued: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(continued ? `${label} (continued)` : label, MARGIN, y);
    y += 2;
    doc.line(MARGIN, y, RIGHT, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
  };
  const rowHeight = (lines: number) => lines * LINE_HEIGHT + ROW_GAP;
  const measure = (name: string): string[] => doc.splitTextToSize(name, NAME_WIDTH);

  for (const section of record.sections) {
    const label = section.trialLabel || 'Trial';
    const firstRow = section.classes[0] ? rowHeight(measure(section.classes[0].name).length) : 0;
    if (y + 9 + firstRow > COVER_BOTTOM) {
      doc.addPage();
      y = 28;
    }
    heading(label, false);
    for (const item of section.classes) {
      const lines = measure(item.name);
      if (y + rowHeight(lines.length) > COVER_BOTTOM) {
        doc.addPage();
        y = 28;
        heading(label, true);
      }
      doc.text(lines, MARGIN + 4, y);
      doc.text(`${item.pages.length} ${item.pages.length === 1 ? 'page' : 'pages'}`, RIGHT, y, {
        align: 'right',
      });
      y += rowHeight(lines.length);
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
