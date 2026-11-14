import { jsPDF } from 'jspdf';

import { reviewSummary, type ReviewClass, type ReviewJudge, type ReviewPage } from './judgeReview';

const MARGIN = 18;
const PAGE_WIDTH = 215.9;
const RIGHT = PAGE_WIDTH - MARGIN;
const ROW_HEIGHT = 7;
const COLUMNS = { armband: MARGIN, dog: 36, handler: 82, result: 128, time: 165, faults: 188 };

export interface ReviewCoverContext {
  showName: string;
  /** Names the rule the judge initials under, or "" when the registry has none we cite. */
  ruleLine: string;
  /** "initial" for AKC, "sign" elsewhere. */
  verb: 'initial' | 'sign';
}

/** The rule line printed on the cover: only AKC's rule is cited (docs/plan-print-packets.md). */
export function reviewRuleLine(registryId: string): string {
  return registryId.trim().toUpperCase() === 'AKC'
    ? 'AKC Scent Work Regulations, Chapter 4, Section 17: the judge examines and initials each page of the catalog.'
    : '';
}

/** AKC's judge initials each page; UKC and ASCA keep the signature (judgeSignOff.ts). */
export function reviewVerb(registryId: string): 'initial' | 'sign' {
  return registryId.trim().toUpperCase() === 'AKC' ? 'initial' : 'sign';
}

/** The cover: what to do, and a tick box for each class. */
export function renderReviewCover(judge: ReviewJudge, context: ReviewCoverContext): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let y = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(reviewSummary(judge), PAGE_WIDTH - MARGIN * 2), MARGIN, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(context.showName, MARGIN, y);
  y += 12;
  doc.setFontSize(11);
  const instructions = [
    `Compare each results page with your scoresheets, then ${context.verb} the page and add the date.`,
    'A score the secretary changed after you submitted it is highlighted, so check those lines first.',
    ...(context.ruleLine ? [context.ruleLine] : []),
  ];
  for (const line of instructions) {
    const wrapped = doc.splitTextToSize(line, PAGE_WIDTH - MARGIN * 2) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 6 + 2;
  }
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.text('Class', MARGIN + 10, y);
  doc.text('Pages', RIGHT - 14, y);
  y += 2;
  doc.line(MARGIN, y, RIGHT, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  for (const item of judge.classes) {
    doc.rect(MARGIN, y - 4, 4.5, 4.5);
    const where = [item.trialLabel, item.dayLabel].filter(Boolean).join(', ');
    doc.text(`${item.name}${where ? ` (${where})` : ''}`, MARGIN + 10, y, {
      maxWidth: RIGHT - MARGIN - 28,
    });
    doc.text(String(item.pages.length), RIGHT - 8, y, { align: 'right' });
    y += 8;
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

function drawResultsPage(
  doc: jsPDF,
  judge: ReviewJudge,
  item: ReviewClass,
  page: ReviewPage,
  pageNumber: number,
  pageCount: number,
  verb: 'initial' | 'sign',
  initialsBox: boolean
): void {
  let y = 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(item.name, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const where = [item.trialLabel, item.dayLabel].filter(Boolean).join(' · ');
  const part = pageCount > 1 ? `  ·  page ${pageNumber} of ${pageCount} of this class` : '';
  doc.text(`${judge.judgeName}  ·  ${where}${part}`, MARGIN, y + 6);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Armband', COLUMNS.armband, y);
  doc.text('Dog', COLUMNS.dog, y);
  doc.text('Handler', COLUMNS.handler, y);
  doc.text('Result', COLUMNS.result, y);
  doc.text('Time', COLUMNS.time, y);
  doc.text('Faults', COLUMNS.faults, y);
  y += 2;
  doc.line(MARGIN, y, RIGHT, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  for (const line of page.lines) {
    if (line.correctionNote) {
      doc.setFillColor(255, 243, 176);
      doc.rect(MARGIN - 1, y - 5, RIGHT - MARGIN + 2, ROW_HEIGHT * 2 - 1, 'F');
    }
    doc.text(line.armband, COLUMNS.armband, y);
    doc.text(line.dogName, COLUMNS.dog, y, { maxWidth: COLUMNS.handler - COLUMNS.dog - 2 });
    doc.text(line.handlerName, COLUMNS.handler, y, {
      maxWidth: COLUMNS.result - COLUMNS.handler - 2,
    });
    doc.text(line.result, COLUMNS.result, y, { maxWidth: COLUMNS.time - COLUMNS.result - 2 });
    doc.text(line.time, COLUMNS.time, y);
    doc.text(line.faults, COLUMNS.faults, y);
    y += ROW_HEIGHT;
    if (line.correctionNote) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.text(line.correctionNote, COLUMNS.dog, y - 1, { maxWidth: RIGHT - COLUMNS.dog });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      y += ROW_HEIGHT;
    }
  }

  if (!initialsBox) return;
  const base = 248;
  doc.setFontSize(10);
  doc.text('I have compared this page with my scoresheets.', MARGIN, base);
  const initials = verb === 'initial' ? 'Initials' : 'Signature';
  doc.text(`${initials} ____________   Date ____________`, MARGIN, base + 8);
}

/**
 * One page for each ReviewPage of each class, in judging order: the pages the judge initials. The
 * judge's record (already initialled and kept) leaves the initials box off.
 */
export function renderReviewPages(
  judge: ReviewJudge,
  verb: 'initial' | 'sign',
  initialsBox = true
): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  let first = true;
  for (const item of judge.classes) {
    item.pages.forEach((page, index) => {
      if (!first) doc.addPage();
      first = false;
      drawResultsPage(doc, judge, item, page, index + 1, item.pages.length, verb, initialsBox);
    });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
