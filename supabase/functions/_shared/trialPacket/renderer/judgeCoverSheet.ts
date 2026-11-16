import type { PacketJudge } from './judgePacketCollation.ts';

/**
 * The judge's cover sheet (MYK9-2085): the model the packet states, and the drawing of it. No
 * runtime dependency on jspdf: the caller passes the constructor, for the reason given in
 * README.md.
 */

export interface JudgeCoverRow {
  classLabel: string;
  /** "9:05 AM", or "" when the class has no scheduled time. */
  start: string;
  dogs: number;
  /** "3:00", or "" when the class has no time limit. */
  maxTime: string;
}

export interface JudgeCoverModel {
  judgeName: string;
  showName: string;
  trialLabel: string;
  dateText: string;
  registryName: string;
  rows: JudgeCoverRow[];
  totalDogs: number;
  /** Sheets after the cover: check-in sheets and scoresheets. */
  sheetCount: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "9:05 AM": a local mirror of `@myk9/core`'s `formatClockTime`, which this module cannot import.
 * `judgePacketRenderer.test.ts` in the app pins the two together, minute by minute.
 */
export function formatPacketClockTime(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60);
  const hour12 = String(hours % 12 === 0 ? 12 : hours % 12);
  const minutes = String(minutesSinceMidnight % 60).padStart(2, '0');
  return `${hour12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** "Mon, Dec 7" from a `YYYY-MM-DD` trial date, read as a calendar date (no time zone shift). */
export function formatCoverDate(date: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!match) return '';
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return `${WEEKDAYS[day.getUTCDay()]}, ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`;
}

/** What the judge's cover sheet says, from the collated packet: counts are the packet's own. */
export function buildJudgeCoverModel(
  packet: { trialLabel: string; trialDate: string | null | undefined; registryName: string },
  judge: PacketJudge,
  showName: string
): JudgeCoverModel {
  return {
    judgeName: judge.judgeName ?? 'No judge assigned',
    showName,
    trialLabel: packet.trialLabel,
    dateText: formatCoverDate(packet.trialDate),
    registryName: packet.registryName,
    rows: judge.classes.map(item => ({
      classLabel: item.label,
      start: item.startMinutes === null ? '' : formatPacketClockTime(item.startMinutes),
      dogs: item.dogCount,
      maxTime: item.maxTime,
    })),
    totalDogs: judge.dogTotal,
    sheetCount: judge.sheetTotal - 1,
  };
}

/** The slice of jsPDF the cover sheet draws with; jsPDF satisfies it structurally. */
export interface CoverPdfDocument {
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  output(type: 'arraybuffer'): ArrayBuffer;
  setFont(font: string, style?: string): unknown;
  setFontSize(size: number): unknown;
  splitTextToSize(text: string, size: number): string[];
  text(text: string | string[], x: number, y: number, options?: { maxWidth?: number }): unknown;
}

export type CoverPdfConstructor = new (options: {
  unit: 'mm';
  format: 'letter';
}) => CoverPdfDocument;

const MARGIN = 20;
const PAGE_WIDTH = 215.9;
const COLUMNS = { start: 110, dogs: 140, maxTime: 165 } as const;

/** The cover sheet as a one-page PDF (a judge's packet starts with it). */
export function drawJudgeCoverPdf(model: JudgeCoverModel, JsPdf: CoverPdfConstructor): Uint8Array {
  const doc = new JsPdf({ unit: 'mm', format: 'letter' });
  let y = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(model.judgeName, MARGIN, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const headline = [model.showName, model.trialLabel, model.dateText, model.registryName]
    .filter(Boolean)
    .join('  ·  ');
  doc.text(doc.splitTextToSize(headline, PAGE_WIDTH - MARGIN * 2), MARGIN, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Class', MARGIN, y);
  doc.text('Start', COLUMNS.start, y);
  doc.text('Dogs', COLUMNS.dogs, y);
  doc.text('Max time', COLUMNS.maxTime, y);
  y += 2;
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  for (const row of model.rows) {
    doc.text(row.classLabel, MARGIN, y, { maxWidth: COLUMNS.start - MARGIN - 4 });
    doc.text(row.start, COLUMNS.start, y);
    doc.text(String(row.dogs), COLUMNS.dogs, y);
    doc.text(row.maxTime, COLUMNS.maxTime, y);
    y += 7;
  }
  doc.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3);
  doc.setFont('helvetica', 'bold');
  doc.text('Total', MARGIN, y + 2);
  doc.text(String(model.totalDogs), COLUMNS.dogs, y + 2);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const lines = [
    `This packet holds ${model.sheetCount} ${model.sheetCount === 1 ? 'sheet' : 'sheets'}, class by class in the order above.`,
    'For each class: the check-in sheet first. Hand it to your gate steward.',
    'Then one scoresheet for each dog, in the order the dogs run.',
    'Scores entered at the ring are the working copy. These sheets are the paper record.',
  ];
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, PAGE_WIDTH - MARGIN * 2);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 6;
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
