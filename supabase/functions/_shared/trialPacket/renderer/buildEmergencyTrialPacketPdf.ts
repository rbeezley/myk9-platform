import { formatEmergencyPacketPageLabel } from './emergencyTrialPacket.ts';
import { resolveScoresheetConfig, type ScoresheetRegistryConfig } from './scoresheetConfig.ts';
import type { EmergencyPacketEntry, EmergencyPacketModel, EmergencyPacketPage } from './types.ts';

/**
 * The PDF surface this renderer uses, declared structurally.
 *
 * Deliberately NOT `import type ... from 'jspdf'`. Deno resolves type-only
 * imports during `deno check`, and `jspdf` is not a dependency relative to
 * `supabase/functions`, so a bare specifier here fails the edge type-check
 * even though it is erased at runtime. Declaring the surface locally is what
 * makes this file genuinely portable — no import map, no source edit
 * (MYK9-228 phase 2).
 *
 * jsPDF satisfies this structurally; `renderPacketPdf.ts` is where that is
 * asserted for the browser, and the edge function does the same with
 * `npm:jspdf`.
 */
export interface PacketPdfDocument {
  addPage(format?: string, orientation?: string): unknown;
  getTextWidth(text: string): number;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  output(type: 'arraybuffer'): ArrayBuffer;
  rect(x: number, y: number, w: number, h: number, style?: string): unknown;
  roundedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    rx: number,
    ry: number,
    style?: string
  ): unknown;
  setDrawColor(r: number, g?: number, b?: number): unknown;
  setFillColor(r: number, g?: number, b?: number): unknown;
  setFont(font: string, style?: string): unknown;
  setFontSize(size: number): unknown;
  setLineWidth(width: number): unknown;
  setProperties(properties: {
    title?: string;
    subject?: string;
    author?: string;
    creator?: string;
  }): unknown;
  setTextColor(r: number, g?: number, b?: number): unknown;
  splitTextToSize(text: string, size: number): string[];
  text(text: string | string[], x: number, y: number, options?: { align?: string }): unknown;
}

/** Options this renderer passes; jsPDF's constructor is overloaded, so pin it. */
export type JsPdfConstructor = new (options: {
  unit: 'mm';
  format: 'letter';
  orientation: 'portrait';
  compress: boolean;
}) => PacketPdfDocument;

type jsPDF = PacketPdfDocument;

export const MAX_EMERGENCY_PACKET_BYTES = 20 * 1024 * 1024;

const PAGE_WIDTH = 215.9;
const PAGE_HEIGHT = 279.4;
const LEFT = 14;
const RIGHT = PAGE_WIDTH - 14;
/**
 * Every page's footer (page label, "Page N of M") is fixed here regardless
 * of kind. Exported so pagination's row-count arithmetic — rows x
 * `SCORE_BLOCK_HEIGHT_MM` plus the worst-case header — can be checked
 * against the SAME number the footer is actually drawn at, instead of a
 * copied literal that can silently drift from it.
 */
export const PAGE_FOOTER_Y_MM = PAGE_HEIGHT - 8;

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', { timeZoneName: 'short' });
}

function addPageFrame(doc: jsPDF, page: EmergencyPacketPage, totalPages: number): void {
  // Empty when the model was built with `snapshotMarker: false` (the Reports
  // path) — draw nothing at all rather than an empty red banner.
  if (page.marker) {
    doc.setTextColor(153, 27, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(page.marker, LEFT, 11);
  }

  doc.setTextColor(25, 25, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Generated ${formatGeneratedAt(page.generatedAt)}`, RIGHT, 11, { align: 'right' });
  doc.setDrawColor(100, 100, 100);
  doc.line(LEFT, 15, RIGHT, 15);

  doc.setFontSize(8);
  doc.text(fitTextToWidth(doc, formatEmergencyPacketPageLabel(page), 150), LEFT, PAGE_FOOTER_Y_MM);
  doc.text(`Page ${page.pageNumber} of ${totalPages}`, RIGHT, PAGE_FOOTER_Y_MM, { align: 'right' });
}

/**
 * Exported alongside `DETAIL_LINE_HEIGHT` so a test can derive the
 * worst-case header's top-of-table y the same way `addTitle` does:
 * `TITLE_BASE_Y + (maxDetailLinesForKind(kind) - 1) * DETAIL_LINE_HEIGHT`.
 */
export const TITLE_BASE_Y = 42;
export const DETAIL_LINE_HEIGHT = 5;
/**
 * Row batching is fixed in the MODEL, so it cannot react to a taller header —
 * every extra header line eats the table's space. The ceiling is therefore per
 * page kind, set by how much slack that kind's batch leaves:
 *
 *   catalog        24 rows + header row = 225mm, ending at 267mm. A SECOND line
 *                  would end at 272mm and overlap the 271.4mm footer, so this
 *                  kind gets exactly one line. It carries no time limit, so
 *                  nothing safety-critical is at stake in the truncation.
 *   check-in       `renderCheckIn` uses a 10mm row height (not the 9mm
 *                  `renderTable` default): 20 rows + header row = 210mm;
 *                  worst-case header (4 lines, y=57) ends at 267mm, only
 *                  4.4mm clear of the 271.4mm footer — thin, not ample.
 *   score          5 blocks x 36mm = 180mm; worst-case header (4 lines, y=57)
 *                  ends at 237mm, 34.4mm clear of the 271.4mm footer. A 6th
 *                  block would end at 273mm — 1.6mm PAST the footer — which
 *                  is why `SCORE_ROWS_FIRST_PAGE`/`SCORE_ROWS_CONTINUATION`
 *                  in `emergencyTrialPacket.ts` are both 5, not 5-then-6.
 *                  See `scoreRowsFitFooter` in
 *                  `buildEmergencyTrialPacketPdf.test.ts` for the guard.
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

/**
 * The min/max armband on THIS page, not the whole class — the spec requires
 * a continuation page to be identifiable by armband range and class once
 * it's separated from the rest of the packet (a page is a physical sheet of
 * paper; it does not carry the other pages' context with it). Folded into
 * the same `details` array `layoutDetailLines` already wraps and truncates,
 * rather than a dedicated line, so it stays inside the existing
 * `MAX_DETAIL_LINES` ceiling the row-count arithmetic depends on.
 */
function formatArmbandRange(entries: readonly EmergencyPacketEntry[]): string | undefined {
  if (entries.length === 0) return undefined;
  const armbands = entries.map(entryItem => entryItem.armband);
  const min = Math.min(...armbands);
  const max = Math.max(...armbands);
  return min === max ? `Armband ${min}` : `Armbands ${min}–${max}`;
}

function addTitle(doc: jsPDF, page: EmergencyPacketPage): number {
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(page.title, LEFT, 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // Hides and distractions belong to the SCOREsheet specifically (the spec's
  // "Scoresheet" section names them alongside element/level/section/judge),
  // not every page kind that shares this class header — check-in and catalog
  // don't gain them. Null means "not configured" and prints nothing at all,
  // never a confident "Hides: 0".
  const isScoreRecording = page.kind === 'score-recording';
  const details = [
    page.context.trialLabel,
    page.context.trialDate,
    page.context.ringLabel,
    page.context.classLabel,
    isScoreRecording ? formatArmbandRange(page.entries) : undefined,
    isScoreRecording && page.context.numHides != null
      ? `Hides: ${page.context.numHides}`
      : undefined,
    isScoreRecording && page.context.distractionCount != null
      ? `Distractions: ${page.context.distractionCount}`
      : undefined,
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
  doc.text(
    'Email or a file on the show laptop is not the emergency endpoint.',
    PAGE_WIDTH / 2,
    y + 20,
    {
      align: 'center',
    }
  );
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

/**
 * Both deleted React components (`CheckInSheet`, `ScoresheetReport`) printed
 * an unassigned armband as an em dash via the app's `formatArmbandDisplay`,
 * never a bare `0`. This module cannot import that helper (no app aliases —
 * see the file banner), and `PacketReportEntry.armband` is already a
 * `number`, so only the numeric half of that helper's behaviour applies here.
 */
const UNASSIGNED_ARMBAND_DISPLAY = '—';

function formatPacketArmband(armband: number): string {
  return armband === 0 || Number.isNaN(armband) ? UNASSIGNED_ARMBAND_DISPLAY : String(armband);
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

type CheckInColumnKey =
  'gate' | 'order' | 'armband' | 'callName' | 'breed' | 'registrationNumber' | 'handler' | 'note';

/**
 * Widths here are sized to the widest HEADER, not the widest expected data —
 * the non-obvious constraint the next editor needs to know before "fixing"
 * one that looks generous for its column's content. All measured at the
 * shared 7.5pt bold header font (`doc.getTextWidth`), budget = width - 3:
 *
 *   gate     'Gate'                5.85mm text, 6.90mm budget -> 1.05mm margin
 *   order    'Order'               7.20mm text, 8.50mm budget -> 1.30mm margin
 *   note     'Pull / Move / Note' 21.85mm text, 22.90mm budget -> 1.05mm margin
 *
 * `gate` and `order` hold no real per-entry text (a checkbox and a usually
 * ≤3-digit number) and `note` is always blank too, so their margins only
 * have to clear their OWN header, not any data. `breed` and `handler` hold
 * real per-entry data that `fitTextToWidth` already truncates gracefully, so
 * they were trimmed slightly (32->30.6, 30 unchanged) to fund `gate`/`order`
 * rather than the other way around; both still carry >17mm of slack over
 * their own header. Data that overflows any column is still truncated by
 * `fitTextToWidth`, never overprinted.
 */
const CHECK_IN_COLUMN_DEFS: ReadonlyArray<{ key: CheckInColumnKey; label: string; width: number }> =
  [
    { key: 'gate', label: 'Gate', width: 9.9 },
    { key: 'order', label: 'Order', width: 11.5 },
    { key: 'armband', label: 'Armband', width: 20 },
    { key: 'callName', label: 'Call Name', width: 34 },
    { key: 'breed', label: 'Breed', width: 30.6 },
    { key: 'registrationNumber', label: 'Reg #', width: 26 },
    { key: 'handler', label: 'Handler', width: 30 },
    { key: 'note', label: 'Pull / Move / Note', width: 25.9 },
  ];

/**
 * The union of the two check-in sheets this replaced: `Order` and
 * `Pull / Move / Note` came from the packet, `Reg #` from the Reports sheet.
 *
 * `x` is derived by summing preceding widths (not a literal) so a width edit
 * moves every column after it — the property the width test relies on: it
 * only checks the FIRST and LAST column's bounds, so a column downstream of
 * an edit must actually shift for a widened middle column to be caught.
 * Widths sum to 187.9 (RIGHT - LEFT); the test asserts the resulting bounds,
 * not this arithmetic, so a change here that breaks the sum fails the test
 * rather than the comment.
 */
export const CHECK_IN_COLUMNS: ReadonlyArray<{
  key: CheckInColumnKey;
  label: string;
  width: number;
  x: number;
}> = (() => {
  let x = LEFT;
  return CHECK_IN_COLUMN_DEFS.map(def => {
    const column = { ...def, x };
    x += def.width;
    return column;
  });
})();

function checkInCellValue(entry: EmergencyPacketEntry, key: CheckInColumnKey): string {
  switch (key) {
    case 'gate':
    case 'note':
      return '';
    case 'order':
      return entry.runOrderDisplay;
    case 'armband':
      return formatPacketArmband(entry.armband);
    case 'callName':
      return entry.callName;
    case 'breed':
      return entry.breed;
    case 'registrationNumber':
      return entry.registrationNumber ?? '';
    case 'handler':
      return entry.handler;
    default:
      return '';
  }
}

/**
 * Custom layout rather than `renderTable`: this table needs the SAME 7.5pt
 * bold header the other tables use — this is a sheet read at arm's length by
 * a secretary or judge, not fine print — so the column widths above (not the
 * font) are what make `'Pull / Move / Note'` fit. `fitTextToWidth` still
 * backstops every header and every cell so a real overflow is truncated,
 * never overprinted.
 */
function renderCheckIn(doc: jsPDF, page: EmergencyPacketPage): void {
  const startY = addTitle(doc, page);
  const rowHeight = 10;
  const totalWidth = RIGHT - LEFT;
  let y = startY;

  doc.setFillColor(55, 65, 81);
  doc.rect(LEFT, y, totalWidth, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  for (const column of CHECK_IN_COLUMNS) {
    // 3mm padding (vs. the 2mm `renderTable` cells use elsewhere) is
    // deliberate, not a typo against the plan: it truncates a hair earlier,
    // never later, so it cannot cause the overprinting the margin exists to
    // prevent.
    doc.text(fitTextToWidth(doc, column.label, column.width - 3), column.x + 1.5, y + 6);
  }
  y += rowHeight;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(20, 20, 20);
  page.entries.forEach((entry, rowIndex) => {
    if (rowIndex % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(LEFT, y, totalWidth, rowHeight, 'F');
    }
    doc.setDrawColor(150, 150, 150);
    for (const column of CHECK_IN_COLUMNS) {
      doc.rect(column.x, y, column.width, rowHeight);
      doc.text(
        fitTextToWidth(doc, checkInCellValue(entry, column.key), column.width - 3),
        column.x + 1.5,
        y + 6
      );
    }
    y += rowHeight;
  });
}

/**
 * Set by the reason lists: five items at ~4mm plus a label is ~24mm, and the
 * identity and fault regions fit inside that. The multi-area time stack (four
 * rows of ~6mm) also fits, which is why a 3-area class does not need a taller
 * block. Exported so pagination and its tests share ONE number.
 */
export const SCORE_BLOCK_HEIGHT_MM = 36;

/**
 * Minimum headroom a per-dog block must keep below `SCORE_BLOCK_HEIGHT_MM`.
 * Measured content is currently ~34.1mm regardless of area count (the
 * reasons region, not the time stack, sets the real ceiling), a 1.9mm margin.
 * A registry config gaining a sixth NQ or EX reason, or a font-metric shift,
 * is the realistic way this gets eaten — see the "trips the guard" test in
 * `buildEmergencyTrialPacketPdf.test.ts`, which mutates a live config to
 * prove this actually catches that.
 */
export const MIN_BLOCK_MARGIN_MM = 1.5;

// INTENT: this sheet is a SUPERSET of what either surface needs. `Place`
// and the free-text note are dead weight when the app is up and the only
// record when it is down. Do not split this into "normal" and "emergency"
// variants, and do not delete the unused-looking fields as a simplification.
// One document, printed the same way every time, is the point.

/**
 * Fixed left edges and widths, in mm, tiling the printable 187.9mm width
 * (14mm margins on a 215.9mm-wide letter page) left to right: identity,
 * result, faults, reasons, time. A judge reads this sheet left to right per
 * dog, so the column order follows the order decisions get made in — who,
 * then result, then why, then how long it took.
 */
const SCORE_REGIONS = {
  identity: { x: 14, width: 55 },
  result: { x: 69, width: 30 },
  faults: { x: 99, width: 35 },
  reasons: { x: 134, width: 45 },
  time: { x: 179, width: 22.9 },
} as const;

const CHECKBOX_SIZE_MM = 2.6;
const TALLY_BOX_SIZE_MM = 4.5;
const REASON_ROW_HEIGHT_MM = 2.7;
const TIME_ROW_HEIGHT_MM = 6;

/** A ruled checkbox (never prose) followed by its label, `fitTextToWidth`-safe. */
function drawCheckboxLabel(
  doc: jsPDF,
  x: number,
  baselineY: number,
  label: string,
  maxLabelWidth: number
): void {
  doc.setDrawColor(90, 90, 90);
  doc.rect(x, baselineY - CHECKBOX_SIZE_MM + 0.6, CHECKBOX_SIZE_MM, CHECKBOX_SIZE_MM);
  doc.text(fitTextToWidth(doc, label, maxLabelWidth), x + CHECKBOX_SIZE_MM + 1.3, baselineY);
}

/**
 * Four separate lines, matching the deleted React component
 * (`ScoresheetReport.tsx`) — not the one 51mm line this replaced.
 *
 * Measured: `Labrador Retriever · SR12345601 · Jennifer Martinez` at 7pt is
 * 57.7mm, past the identity region's ~51mm width (`region.width - 4`), so
 * every one of breed/reg#/handler sharing one `fitTextToWidth`-truncated
 * line silently ate the tail — usually the handler, the person accountable
 * for the dog, on a document retained for a year. Splitting onto their own
 * lines still truncates each field independently (never overprints), and
 * uses only ~23mm of this block's ~36mm height — well inside the ~34.1mm
 * `renderReasonsRegion` already needs, which is the block's real ceiling
 * (see `MIN_BLOCK_MARGIN_MM`).
 */
function renderIdentityRegion(doc: jsPDF, entry: EmergencyPacketEntry, y0: number): void {
  const region = SCORE_REGIONS.identity;
  const textX = region.x + 2;
  const maxWidth = region.width - 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    fitTextToWidth(doc, `#${formatPacketArmband(entry.armband)}  ${entry.callName}`, maxWidth),
    textX,
    y0 + 7
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const lines = [entry.breed, entry.registrationNumber, entry.handler].filter(
    (value): value is string => Boolean(value)
  );
  lines.forEach((line, index) => {
    doc.text(fitTextToWidth(doc, line, maxWidth), textX, y0 + 13 + index * 5);
  });
}

function renderResultRegion(doc: jsPDF, config: ScoresheetRegistryConfig, y0: number): void {
  const region = SCORE_REGIONS.result;
  const colWidth = region.width / 2 - 4;
  const col1 = region.x + 2;
  const col2 = region.x + region.width / 2 + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  config.resultStates.forEach((state, index) => {
    const x = index % 2 === 0 ? col1 : col2;
    const row = Math.floor(index / 2);
    drawCheckboxLabel(doc, x, y0 + 6 + row * 7, state, colWidth);
  });
  const rows = Math.ceil(config.resultStates.length / 2);
  doc.text(fitTextToWidth(doc, 'Place: ______', region.width - 4), col1, y0 + 6 + rows * 7 + 4);
}

function renderFaultsRegion(doc: jsPDF, config: ScoresheetRegistryConfig, y0: number): void {
  const region = SCORE_REGIONS.faults;
  const boxX = region.x + 2;
  const labelX = boxX + TALLY_BOX_SIZE_MM + 2;
  const maxLabelWidth = region.width - TALLY_BOX_SIZE_MM - 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  config.faultCounters.forEach((label, index) => {
    const y = y0 + 6 + index * 8;
    doc.setDrawColor(90, 90, 90);
    doc.rect(boxX, y - TALLY_BOX_SIZE_MM + 1, TALLY_BOX_SIZE_MM, TALLY_BOX_SIZE_MM);
    doc.text(fitTextToWidth(doc, label, maxLabelWidth), labelX, y);
  });
}

/** One vertical list of checkbox reasons under a bold section label. Returns the y reached. */
function renderReasonList(
  doc: jsPDF,
  x: number,
  startY: number,
  label: string,
  reasons: readonly string[],
  maxLabelWidth: number
): number {
  let y = startY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  for (const reason of reasons) {
    y += REASON_ROW_HEIGHT_MM;
    drawCheckboxLabel(doc, x, y, reason, maxLabelWidth);
  }
  return y;
}

function renderReasonsRegion(doc: jsPDF, config: ScoresheetRegistryConfig, y0: number): void {
  const region = SCORE_REGIONS.reasons;
  const x = region.x + 2;
  const maxLabelWidth = region.width - CHECKBOX_SIZE_MM - 5;
  const afterNq = renderReasonList(doc, x, y0 + 3.5, 'NQ', config.nqReasons, maxLabelWidth);
  renderReasonList(doc, x, afterNq + 3, 'EX', config.exReasons, maxLabelWidth);
}

/**
 * The most rows `renderTimeRegion` can draw and stay inside
 * `SCORE_BLOCK_HEIGHT_MM` (36mm): row N's box bottom sits at
 * `6 + (N-1) * TIME_ROW_HEIGHT_MM + 0.5` below `y0` — row 5 ends at 30.5mm,
 * comfortably inside; row 6 ends at 36.5mm, 0.5mm PAST the block. `MAX_AREAS`
 * (`emergencyTrialPacket.ts`) is 10 and deliberately NOT lowered to match:
 * `formatClassTimeLimits`'s header intentionally names every area up to 10,
 * even past the three limit columns (see
 * `emergencyTrialPacket.test.ts`'s "enumerates every declared area" and
 * "refuses to let a nonsense area count run off the page" — that is a text
 * label that wraps, not a fixed-height box). The per-dog time STACK is the
 * one with a hard geometry ceiling, so it clamps independently here instead.
 */
const TIME_REGION_MAX_ROWS = 5;

/**
 * `MM/SS/TT` boxes for a single-area class; per-area rows plus a `Total` row
 * otherwise. `areaCount` is the SAME clamp `formatClassTimeLimits` uses
 * (`resolveAreaCount`), reused via `page.context.areaCount` rather than
 * recomputed here — two divergent area counts is the drift this sheet exists
 * to remove.
 *
 * Every dog's block relabels its own rows, same as every other region on the
 * sheet (identity, result, faults, reasons all repeat per dog). A page
 * separated from the rest of the packet, or a judge working down the column
 * without re-reading the top block, still has to be able to tell an `A2` box
 * from a `Total` box on ANY row — a header printed once and never again is
 * the wrong trade for a document retained for a year.
 *
 * `resolveAreaCount` clamps to `MAX_AREAS` (10), which alone would ask for up
 * to 11 rows here — 6.5mm past the block for a 6-area class, compounding into
 * every block below it on the page (whole-branch review finding #6). Areas
 * beyond what `TIME_REGION_MAX_ROWS` can hold collapse into one visible
 * "+N" marker row instead of silently running off the block ("+N more"
 * does not fit the ~5.7mm label column at this font size and
 * `fitTextToWidth` would only truncate it back down to "+N" anyway); the
 * judge still gets every area's box up to the limit, plus a `Total` row, and
 * is told in ink that more areas exist than this sheet has room to print
 * (a class configuration this large should also prompt a registry-config
 * review, not just a bigger form).
 */
function renderTimeRegion(doc: jsPDF, areaCount: number, y0: number): void {
  const region = SCORE_REGIONS.time;
  const labelX = region.x + 1;
  const boxX = region.x + 7.5;
  const boxWidth = region.width - 8.5;
  const maxLabelWidth = boxX - labelX - 0.8;
  const desiredRows =
    areaCount <= 1
      ? ['MM', 'SS', 'TT']
      : [...Array.from({ length: areaCount }, (_, index) => `A${index + 1}`), 'Total'];
  let rows = desiredRows;
  if (desiredRows.length > TIME_REGION_MAX_ROWS) {
    const areaLabels = desiredRows.slice(0, -1);
    const shownAreas = areaLabels.slice(0, TIME_REGION_MAX_ROWS - 2);
    const hiddenCount = areaLabels.length - shownAreas.length;
    rows = [...shownAreas, `+${hiddenCount}`, 'Total'];
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rows.forEach((label, index) => {
    const y = y0 + 6 + index * TIME_ROW_HEIGHT_MM;
    doc.text(fitTextToWidth(doc, label, maxLabelWidth), labelX, y);
    doc.setDrawColor(90, 90, 90);
    doc.rect(boxX, y - 4, boxWidth, 4.5);
  });
}

function renderScoreRecording(doc: jsPDF, page: EmergencyPacketPage): void {
  const y0Title = addTitle(doc, page);
  const config = resolveScoresheetConfig(page.context.registryId);
  // Falls back to 1 only for a page built outside the normal model pipeline
  // (a hand-constructed test fixture); every real class page sets this via
  // `resolveAreaCount` in `buildEmergencyPacketModel`.
  const areaCount = page.context.areaCount ?? 1;
  let y = y0Title;
  for (const entry of page.entries) {
    doc.setDrawColor(90, 90, 90);
    doc.rect(LEFT, y, RIGHT - LEFT, SCORE_BLOCK_HEIGHT_MM);
    renderIdentityRegion(doc, entry, y);
    renderResultRegion(doc, config, y);
    renderFaultsRegion(doc, config, y);
    renderReasonsRegion(doc, config, y);
    renderTimeRegion(doc, areaCount, y);
    y += SCORE_BLOCK_HEIGHT_MM;
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
  doc.text(
    'Secretary signature: _________________________________   Date: ______________',
    LEFT,
    y
  );
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
  doc.text(
    'Transcribed by: ______________________________________  Date/time: __________________',
    LEFT,
    y
  );
  y += 18;
  doc.text(
    'Checked by: _________________________________________  Date/time: __________________',
    LEFT,
    y
  );
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
  // The emergency titling and subject are only true of the actual emergency
  // packet — a Reports-page check-in sheet or scoresheet printed on an
  // ordinary working day is not a degraded-mode snapshot (whole-branch
  // review finding #7).
  doc.setProperties(
    model.snapshotMarker
      ? {
          title: `${model.show.name} — Emergency Trial Packet`,
          subject: 'Paper fallback snapshot for degraded show-day operation',
          author: 'myK9Show',
          creator: 'myK9Show',
        }
      : {
          title: model.show.name,
          author: 'myK9Show',
          creator: 'myK9Show',
        }
  );

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
