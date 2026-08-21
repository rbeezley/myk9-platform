import jsPDF from 'jspdf';
import { formatEmergencyPacketPageLabel } from './emergencyTrialPacket';
import type { EmergencyPacketModel, EmergencyPacketPage } from './types';

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
    page.context.timeLimitLabel,
  ].filter(Boolean);
  // Wrap rather than truncate. A multi-area class ("Max time — Area 1 3:00 ·
  // Area 2 2:00 · Area 3 1:30") can exceed the text column, and the time limit
  // sits LAST — `fitTextToWidth` would clip exactly the safety-critical part.
  //
  // Only class-scoped pages (check-in, score recording) can wrap, and both have
  // vertical slack: check-in ends near 231mm and score recording near 250mm
  // against a 271.4mm footer. Catalog pages run to ~267mm and are the tight
  // ones, but they carry no class label, judge or time limit, so they stay a
  // single line. Keep that true if this detail list ever grows.
  const detailLines = doc.splitTextToSize(details.join(' · '), RIGHT - LEFT) as string[];
  doc.text(detailLines, LEFT, 34);
  return 42 + (detailLines.length - 1) * 5;
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
  doc.text(`Snapshot generated: ${formatGeneratedAt(page.generatedAt)}`, LEFT, 260);
  doc.text(`Show dates: ${page.context.trialDate}`, LEFT, 268);
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

export function buildEmergencyTrialPacketPdf(model: EmergencyPacketModel): Uint8Array {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait', compress: true });
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
