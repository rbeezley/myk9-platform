// TYPE-only: erased at runtime, so neither Vite nor Deno resolves `jspdf`
// from this module. The constructor is injected by the caller, which is what
// lets the app pass `jspdf` and an edge function pass `npm:jspdf` without a
// second copy of the renderer (MYK9-228 phase 2).
import type JsPdfClass from 'jspdf';
import { formatEmergencyPacketPageLabel } from './emergencyTrialPacket.ts';
import type { EmergencyPacketModel, EmergencyPacketPage } from './types.ts';

type jsPDF = JsPdfClass;
/**
 * jsPDF's constructor is overloaded (options object OR positional
 * orientation), so `ConstructorParameters` resolves to the wrong signature.
 * Declare the options shape this renderer actually passes.
 */
export type JsPdfConstructor = new (options: {
  unit: 'mm';
  format: 'letter';
  orientation: 'portrait';
  compress: boolean;
}) => JsPdfClass;

export const MAX_EMERGENCY_PACKET_BYTES = 20 * 1024 * 1024;

const PAGE_WIDTH = 215.9;
const PAGE_HEIGHT = 279.4;
const LEFT = 14;
const RIGHT = PAGE_WIDTH - 14;

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', { timeZoneName: 'short' });
}

function addPageFrame(doc: jsPDF, page: EmergencyPacketPage, totalPages: number): void {
  doc.setTextColor(153, 27, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(page.marker, LEFT, 11);

  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${formatGeneratedAt(page.generatedAt)}`, RIGHT, 11, { align: 'right' });
  doc.setDrawColor(100, 100, 100);
  doc.line(LEFT, 15, RIGHT, 15);

  doc.setFontSize(8);
  doc.text(fitTextToWidth(doc, formatEmergencyPacketPageLabel(page), 150), LEFT, PAGE_HEIGHT - 8);
  doc.text(`Page ${page.pageNumber} of ${totalPages}`, RIGHT, PAGE_HEIGHT - 8, { align: 'right' });
}

const TITLE_BASE_Y = 42;
const DETAIL_LINE_HEIGHT = 5;
/**
 * Row batching is fixed in the MODEL, so it cannot react to a taller header —
 * every extra header line eats the table's space. The ceiling is therefore per
 * page kind, set by how much slack that kind's batch leaves:
 *
 *   catalog        24 rows + header row = 225mm, ending at 267mm. A SECOND line
 *                  would end at 272mm and overlap the 271.4mm footer, so this
 *                  kind gets exactly one line. It carries no time limit, so
 *                  nothing safety-critical is at stake in the truncation.
 *   check-in       20 rows + header row = 189mm, ending at 231mm. Ample.
 *   score          7 blocks x 29mm = 203mm, ending at 245mm; four lines ends
 *                  near 260mm.
 *
 * If a batch size changes, re-derive these.
 */
const MAX_DETAIL_LINES = 4;
/** Cover trial-name lines; four end at 265mm, clear of the 271.4mm footer. */
const MAX_COVER_TRIAL_LINES = 4;
const CATALOG_MAX_DETAIL_LINES = 1;

/** Exported so the per-kind ceiling is pinned by a test, not just a comment. */
export function maxDetailLinesForKind(kind: EmergencyPacketPage['kind']): number {
  return kind === 'catalog' ? CATALOG_MAX_DETAIL_LINES : MAX_DETAIL_LINES;
}

/**
 * Lay out the context line under the page title.
 *
 * The time limit is the one item here a judge cannot reconstruct from the rest
 * of the page, so it gets its own line and is never the thing that gets cut.
 * Identity (trial, date, ring, class, judge) is what gets truncated when a
 * pathological class or judge name would otherwise push the table off the page.
 */
export function layoutDetailLines(
  doc: jsPDF,
  identityParts: Array<string | undefined>,
  timeLimitLabel: string | undefined,
  maxLines: number = MAX_DETAIL_LINES
): string[] {
  const width = RIGHT - LEFT;
  const limitLines = timeLimitLabel
    ? (doc.splitTextToSize(timeLimitLabel, width) as string[]).slice(0, 2)
    : [];
  const identity = identityParts.filter(Boolean).join(' · ');
  let identityLines = doc.splitTextToSize(identity, width) as string[];

  const identityBudget = Math.max(1, maxLines - limitLines.length);
  if (identityLines.length > identityBudget) {
    identityLines = identityLines.slice(0, identityBudget);
    const last = identityBudget - 1;
    // `fitTextToWidth` marks truncation with '...'; match the rest of the file.
    identityLines[last] = fitTextToWidth(doc, `${identityLines[last]}...`, width);
  }

  return [...identityLines, ...limitLines];
}

function addTitle(doc: jsPDF, page: EmergencyPacketPage): number {
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(page.title, LEFT, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const details = [
    page.context.trialLabel,
    page.context.trialDate,
    page.context.ringLabel,
    page.context.classLabel,
    page.context.judgeName ? `Judge: ${page.context.judgeName}` : undefined,
  ];
  const detailLines = layoutDetailLines(
    doc,
    details,
    page.context.timeLimitLabel,
    maxDetailLinesForKind(page.kind)
  );
  doc.text(detailLines, LEFT, 34);
  return TITLE_BASE_Y + (detailLines.length - 1) * DETAIL_LINE_HEIGHT;
}

function renderCover(doc: jsPDF, model: EmergencyPacketModel, page: EmergencyPacketPage): void {
  let y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(model.show.name, LEFT, y);
  y += 12;
  doc.setFontSize(18);
  doc.text('Emergency Trial Packet', LEFT, y);
  y += 14;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(153, 27, 27);
  doc.roundedRect(LEFT, y, RIGHT - LEFT, 27, 2, 2, 'FD');
  doc.setTextColor(127, 29, 29);
  doc.setFontSize(15);
  doc.text('PRINT THIS PACKET AND PUT IT IN THE TRIAL BOX.', PAGE_WIDTH / 2, y + 11, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Email or a file on the show laptop is not the emergency endpoint.', PAGE_WIDTH / 2, y + 20, {
    align: 'center',
  });
  y += 38;

  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('What is in this packet', LEFT, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const contents = [
    'Entry catalog by trial day',
    'Check-in and running order for every class',
    'Writable score-recording rows pre-printed with dog and armband identity',
    'Judge and secretary certification/signature pages',
    'Instructions for recording changes and transcribing paper results back into myK9',
  ];
  for (const item of contents) {
    doc.text(`• ${item}`, LEFT + 3, y);
    y += 7;
  }

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Paper-mode rules', LEFT, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const rules = [
    'This is a snapshot, not live data. Use the generation time on every page.',
    'Write pulls, move-ups, absences, time changes, and corrections directly on the paper.',
    'Keep each page with its class; every footer identifies the trial day, ring, and class.',
    'Initial corrections. Preserve all pages until paper results are transcribed and checked.',
  ];
  for (const rule of rules) {
    const lines = doc.splitTextToSize(`• ${rule}`, RIGHT - LEFT - 6) as string[];
    doc.text(lines, LEFT + 3, y);
    y += lines.length * 5 + 3;
  }

  doc.setFont('helvetica', 'bold');
  // Budget upward from the footer at PAGE_HEIGHT - 8 (271.4mm): trial names may
  // take two lines, so they start at 252 and end by 257 — the block cannot
  // reach the footer however many trials a day holds.
  // Budget upward from the footer at PAGE_HEIGHT - 8 (271.4mm). Four name
  // lines end at 265mm, so this block cannot reach the footer.
  doc.text(`Snapshot generated: ${formatGeneratedAt(page.generatedAt)}`, LEFT, 228);
  doc.text(`This packet covers: ${page.context.trialDate}`, LEFT, 236);
  // Name the trials inside, so a secretary holding two evenings' stacks can
  // tell them apart without leafing through. A day can hold several trials,
  // and they can run under different sanctioning bodies.
  const trialNames = model.trials.map(trial => trial.name || trial.trialNumber).filter(Boolean);
  if (trialNames.length > 0) {
    doc.text('Trials in this packet:', LEFT, 244);
    doc.setFont('helvetica', 'normal');
    // One per line, and never SILENTLY dropped: a cover that omits a trial
    // fails at the one job it has here. Past the budget the last line says how
    // many are missing, so the reader knows to look inside.
    const shown =
      trialNames.length <= MAX_COVER_TRIAL_LINES
        ? trialNames
        : [
            ...trialNames.slice(0, MAX_COVER_TRIAL_LINES - 1),
            `+${trialNames.length - (MAX_COVER_TRIAL_LINES - 1)} more — see the trial sections inside`,
          ];
    shown.forEach((name, index) => {
      doc.text(fitTextToWidth(doc, `• ${name}`, RIGHT - LEFT - 4), LEFT + 3, 250 + index * 5);
    });
  }
}

function fitTextToWidth(doc: jsPDF, value: string, width: number): string {
  if (doc.getTextWidth(value) <= width) return value;
  let fitted = value;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > width) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}...`;
}

function renderTable(
  doc: jsPDF,
  startY: number,
  headers: string[],
  widths: number[],
  rows: string[][],
  rowHeight = 9
): void {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  let y = startY;
  doc.setFillColor(55, 65, 81);
  doc.rect(LEFT, y, totalWidth, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  let x = LEFT;
  headers.forEach((header, index) => {
    doc.text(fitTextToWidth(doc, header, widths[index] - 3), x + 1.5, y + 6);
    x += widths[index];
  });
  y += rowHeight;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 20);
  rows.forEach((row, rowIndex) => {
    if (rowIndex % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(LEFT, y, totalWidth, rowHeight, 'F');
    }
    doc.setDrawColor(150, 150, 150);
    x = LEFT;
    row.forEach((value, columnIndex) => {
      const width = widths[columnIndex];
      doc.rect(x, y, width, rowHeight);
      doc.text(fitTextToWidth(doc, String(value ?? ''), width - 3), x + 1.5, y + 6);
      x += width;
    });
    y += rowHeight;
  });
}

function renderCatalog(doc: jsPDF, page: EmergencyPacketPage): void {
  const startY = addTitle(doc, page);
  renderTable(
    doc,
    startY,
    ['Order', 'Armband', 'Dog', 'Breed', 'Class', 'Handler', 'Registration'],
    [14, 19, 25, 28, 30, 35, 37],
    page.entries.map(entry => [
      entry.runOrderDisplay,
      String(entry.armband),
      entry.callName,
      entry.breed,
      [entry.classElement, entry.classLevel, entry.classSection].filter(Boolean).join(' '),
      entry.handler,
      entry.registrationNumber ?? '',
    ])
  );
}

function renderCheckIn(doc: jsPDF, page: EmergencyPacketPage): void {
  const startY = addTitle(doc, page);
  renderTable(
    doc,
    startY,
    ['Gate', 'Order', 'Armband', 'Dog', 'Breed', 'Handler', 'Pull / Move / Note'],
    [13, 14, 19, 28, 30, 35, 49],
    page.entries.map(entry => [
      entry.checkInMark,
      entry.runOrderDisplay,
      String(entry.armband),
      entry.callName,
      entry.breed,
      entry.handler,
      '',
    ]),
    10
  );
}

function renderScoreRecording(doc: jsPDF, page: EmergencyPacketPage): void {
  let y = addTitle(doc, page);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  for (const entry of page.entries) {
    doc.setDrawColor(90, 90, 90);
    doc.rect(LEFT, y, RIGHT - LEFT, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(fitTextToWidth(doc, `#${entry.armband}  ${entry.callName}`, RIGHT - LEFT - 6), LEFT + 3, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(fitTextToWidth(
      doc,
      [entry.breed, entry.registrationNumber, entry.handler].filter(Boolean).join(' · '),
      RIGHT - LEFT - 6
    ), LEFT + 3, y + 12);
    doc.text('Result:  [ ] Q   [ ] NQ   [ ] EX   [ ] ABS', LEFT + 3, y + 19);
    doc.text('Time: __________', 87, y + 19);
    doc.text('Faults: ______', 125, y + 19);
    doc.text('Place: ______', 159, y + 19);
    doc.text('Notes / reason: __________________________________________________________', LEFT + 3, y + 25);
    y += 29;
  }
}

function renderCertification(doc: jsPDF, page: EmergencyPacketPage): void {
  let y = addTitle(doc, page);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const copy = [
    'Use this page for the signatures and totals required to preserve a paper record of this trial day.',
    'Attach registry-specific official certification pages from Reports when the sanctioning body requires them.',
  ];
  for (const text of copy) {
    const lines = doc.splitTextToSize(text, RIGHT - LEFT) as string[];
    doc.text(lines, LEFT, y);
    y += lines.length * 6 + 4;
  }
  const fields = [
    'Total entries: ____________________',
    'Total runs: ______________________',
    'Total qualifying: _________________',
    'Withdrawn / absent: ______________',
  ];
  for (const field of fields) {
    doc.text(field, LEFT, y);
    y += 10;
  }
  y += 15;
  doc.text('Judge signature: ____________________________________   Date: ______________', LEFT, y);
  y += 25;
  doc.text('Secretary signature: _________________________________   Date: ______________', LEFT, y);
  y += 25;
  doc.text('Corrections / incident notes:', LEFT, y);
  for (let line = 1; line <= 6; line += 1) {
    doc.line(LEFT, y + line * 9, RIGHT, y + line * 9);
  }
}

function renderTranscription(doc: jsPDF, page: EmergencyPacketPage): void {
  let y = addTitle(doc, page);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Do not discard the paper after the app returns.', LEFT, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const steps = [
    'Gather every check-in, running-order, score, certification, correction, and incident page.',
    'Use the generation time and page footers to separate this snapshot from older copies.',
    'In myK9, apply pulls, move-ups, absences, and class-order changes before entering scores.',
    'Enter each score from the paper. A second person should read back armband, result, time, faults, and placement.',
    'Compare class totals and judge/secretary certifications against the system before releasing or submitting results.',
    'Write the transcription completion time and both reviewers below; retain the packet with the club records.',
  ];
  steps.forEach((step, index) => {
    const lines = doc.splitTextToSize(`${index + 1}. ${step}`, RIGHT - LEFT - 4) as string[];
    doc.text(lines, LEFT + 2, y);
    y += lines.length * 6 + 6;
  });
  y += 10;
  doc.text('Transcribed by: ______________________________________  Date/time: __________________', LEFT, y);
  y += 18;
  doc.text('Checked by: _________________________________________  Date/time: __________________', LEFT, y);
  y += 22;
  doc.text('Discrepancies and resolutions:', LEFT, y);
  for (let line = 1; line <= 6; line += 1) {
    doc.line(LEFT, y + line * 9, RIGHT, y + line * 9);
  }
}

export function buildEmergencyTrialPacketPdf(
  model: EmergencyPacketModel,
  JsPdf: JsPdfConstructor
): Uint8Array {
  const doc = new JsPdf({ unit: 'mm', format: 'letter', orientation: 'portrait', compress: true });
  doc.setProperties({
    title: `${model.show.name} — Emergency Trial Packet`,
    subject: 'Paper fallback snapshot for degraded show-day operation',
    author: 'myK9Show',
    creator: 'myK9Show',
  });

  model.pages.forEach((page, index) => {
    if (index > 0) doc.addPage('letter', 'portrait');
    addPageFrame(doc, page, model.pages.length);
    switch (page.kind) {
      case 'cover':
        renderCover(doc, model, page);
        break;
      case 'catalog':
        renderCatalog(doc, page);
        break;
      case 'check-in':
        renderCheckIn(doc, page);
        break;
      case 'score-recording':
        renderScoreRecording(doc, page);
        break;
      case 'certification':
        renderCertification(doc, page);
        break;
      case 'transcription':
        renderTranscription(doc, page);
        break;
    }
  });

  const bytes = new Uint8Array(doc.output('arraybuffer'));
  if (bytes.byteLength > MAX_EMERGENCY_PACKET_BYTES) {
    throw new Error('Emergency packet is too large to upload. Narrow the show data and try again.');
  }
  return bytes;
}
