import { jsPDF } from 'jspdf';
import { formatClockTime } from '@myk9/core';

import type { CollatedTrialPacket, TrialPacketJudge } from './collateTrialPacket';

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

/** "Mon, Dec 7" from a `YYYY-MM-DD` trial date, read as a calendar date (no time zone shift). */
export function formatCoverDate(date: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!match) return '';
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return `${WEEKDAYS[day.getUTCDay()]}, ${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`;
}

/** What the judge's cover sheet says, from the collated packet: counts are the packet's own. */
export function buildJudgeCoverModel(
  packet: CollatedTrialPacket,
  judge: TrialPacketJudge,
  showName: string
): JudgeCoverModel {
  return {
    judgeName: judge.judgeName ?? 'No judge assigned',
    showName,
    trialLabel: packet.trialLabel,
    dateText: formatCoverDate(packet.trial.date),
    registryName: packet.registryName,
    rows: judge.classes.map(item => ({
      classLabel: item.label,
      start: item.startMinutes === null ? '' : formatClockTime(item.startMinutes),
      dogs: item.dogCount,
      maxTime: item.maxTime,
    })),
    totalDogs: judge.dogTotal,
    sheetCount: judge.sheetTotal - 1,
  };
}

const MARGIN = 20;
const PAGE_WIDTH = 215.9;
const COLUMNS = { start: 110, dogs: 140, maxTime: 165 } as const;

/** The cover sheet as a one-page PDF (a judge's packet starts with it). */
export function renderJudgeCoverPdf(model: JudgeCoverModel): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
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
    const wrapped = doc.splitTextToSize(line, PAGE_WIDTH - MARGIN * 2) as string[];
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 6;
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
