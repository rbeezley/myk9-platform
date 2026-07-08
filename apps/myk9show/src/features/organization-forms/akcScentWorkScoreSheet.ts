import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatClassLabel } from '@/lib/utils';
import {
  formatReportDate,
  formatTimeLimit,
  sortByArmband,
  sortByRunOrder,
} from '@/lib/reports/reportUtils';
import type { ReportProps } from '@/lib/reports/types';
import { trialEventNumber } from './reportValueHelpers';

export interface ScoreSheetValues {
  armNumber: string;
  breed: string;
  callName: string;
  className: string;
  date: string;
  eventNumber: string;
  timeLimits: string;
}

interface DrawSlot {
  armNumber: { x: number; y: number; maxWidth: number };
  breed: { x: number; y: number; maxWidth: number };
  callName: { x: number; y: number; maxWidth: number };
  className: { x: number; y: number; maxWidth: number };
  date: { x: number; y: number; maxWidth: number };
  eventNumber: { x: number; y: number; maxWidth: number };
  timeLimits: { x: number; y: number; maxWidth: number };
}

const LEFT_SLOT: DrawSlot = {
  date: { x: 70, y: 535, maxWidth: 86 },
  eventNumber: { x: 224, y: 535, maxWidth: 114 },
  className: { x: 69, y: 508, maxWidth: 155 },
  armNumber: { x: 296, y: 508, maxWidth: 55 },
  callName: { x: 91, y: 484, maxWidth: 145 },
  breed: { x: 257, y: 484, maxWidth: 83 },
  timeLimits: { x: 158, y: 390, maxWidth: 148 },
};

const RIGHT_SLOT: DrawSlot = shiftSlot(LEFT_SLOT, 396);

export function buildAKCScentWorkScoreSheetFilename(props: ReportProps): string {
  const eventToken = sanitizeFilenameToken(
    trialEventNumber(props) ?? props.trial?.trialNumber ?? 'trial'
  );
  const classToken = sanitizeFilenameToken(scoreSheetClassName(props) || 'class');
  return `akc-score-sheets-${eventToken}-${classToken}.pdf`;
}

export function buildAKCScentWorkScoreSheetValues(props: ReportProps): ScoreSheetValues[] {
  const sortedEntries =
    props.sortOrder === 'armband' ? sortByArmband(props.entries) : sortByRunOrder(props.entries);
  const shared = {
    className: scoreSheetClassName(props),
    date: props.trial?.date ? formatReportDate(props.trial.date) : '',
    eventNumber: trialEventNumber(props) ?? '',
    timeLimits: scoreSheetTimeLimits(props),
  };

  return sortedEntries.map(entry => ({
    ...shared,
    armNumber: entry.armband ? String(entry.armband) : '',
    breed: entry.breed,
    callName: entry.callName,
  }));
}

export async function buildAKCScentWorkScoreSheetPdfBytes(input: {
  props: ReportProps;
  templateBytes: Uint8Array;
}): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(input.templateBytes);
  const outputPdf = await PDFDocument.create();
  const font = await outputPdf.embedFont(StandardFonts.Helvetica);
  const values = buildAKCScentWorkScoreSheetValues(input.props);

  for (let index = 0; index < Math.max(1, values.length); index += 2) {
    const [templatePage] = await outputPdf.copyPages(sourcePdf, [0]);
    if (!templatePage) {
      throw new Error('Unable to load AKC Scent Work score sheet template page.');
    }
    outputPdf.addPage(templatePage);
    drawScoreSheetSlot(templatePage, font, LEFT_SLOT, values[index]);
    drawScoreSheetSlot(templatePage, font, RIGHT_SLOT, values[index + 1]);
  }

  return outputPdf.save();
}

function drawScoreSheetSlot(
  page: PDFPage,
  font: PDFFont,
  slot: DrawSlot,
  values: ScoreSheetValues | undefined
): void {
  if (!values) return;

  drawFitText(page, font, values.date, slot.date);
  drawFitText(page, font, values.eventNumber, slot.eventNumber);
  drawFitText(page, font, values.className, slot.className);
  drawFitText(page, font, values.armNumber, slot.armNumber);
  drawFitText(page, font, values.callName, slot.callName);
  drawFitText(page, font, values.breed, slot.breed);
  drawFitText(page, font, values.timeLimits, slot.timeLimits);
}

function drawFitText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  position: { x: number; y: number; maxWidth: number }
): void {
  const text = value.trim();
  if (!text) return;

  let size = 9;
  while (size > 6 && font.widthOfTextAtSize(text, size) > position.maxWidth) {
    size -= 0.5;
  }

  page.drawText(text, {
    x: position.x,
    y: position.y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function scoreSheetClassName(props: ReportProps): string {
  const classData = props.classData;
  if (!classData) return '';
  return formatClassLabel(classData.element, classData.level, '', classData.section);
}

function scoreSheetTimeLimits(props: ReportProps): string {
  const classData = props.classData;
  if (!classData) return '';

  const limits =
    (classData.areaCount ?? 1) > 1
      ? [
          formatTimeLimit(classData.timeLimitSeconds),
          formatTimeLimit(classData.timeLimitArea2Seconds),
          formatTimeLimit(classData.timeLimitArea3Seconds),
        ].filter(Boolean)
      : [formatTimeLimit(classData.timeLimitSeconds)].filter(Boolean);

  return limits.join(' / ');
}

function shiftSlot(slot: DrawSlot, xOffset: number): DrawSlot {
  return Object.fromEntries(
    Object.entries(slot).map(([key, value]) => [
      key,
      {
        ...value,
        x: value.x + xOffset,
      },
    ])
  ) as unknown as DrawSlot;
}

function sanitizeFilenameToken(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sheet'
  );
}
