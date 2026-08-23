import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import {
  buildEmergencyPacketModel,
  SCORE_ROWS_CONTINUATION,
  SCORE_ROWS_FIRST_PAGE,
  splitPacketInputByTrialDay,
} from './emergencyTrialPacket';
import jsPDF from 'jspdf';
import {
  buildEmergencyTrialPacketPdf as buildEmergencyTrialPacketPdfWithCtor,
  CHECK_IN_COLUMNS,
  DETAIL_LINE_HEIGHT,
  layoutDetailLines,
  maxDetailLinesForKind,
  MAX_EMERGENCY_PACKET_BYTES,
  MIN_BLOCK_MARGIN_MM,
  PAGE_FOOTER_Y_MM,
  SCORE_BLOCK_HEIGHT_MM,
  TITLE_BASE_Y,
  type JsPdfConstructor,
} from './buildEmergencyTrialPacketPdf';
// Exercise the APP binding, so these tests cover the same path the product
// uses rather than a hand-passed constructor.
import { renderEmergencyTrialPacketPdf as buildEmergencyTrialPacketPdf } from './renderPacketPdf';
import { resolveScoresheetConfig, SCORESHEET_CONFIGS } from './scoresheetConfig';
import type { EmergencyPacketClass, EmergencyPacketInput, EmergencyPacketPageKind } from './types';

function reportEntry(id: string, classId: string, trialId: string, armband: number): ReportEntry {
  return {
    id,
    armband,
    breed: 'All-American Dog',
    callName: `Dog ${armband}`,
    checkInStatus: null,
    classId,
    finalPlacement: null,
    handler: `Handler ${armband}`,
    isScored: false,
    registrationNumber: `REG-${armband}`,
    resultText: null,
    runOrder: armband,
    searchTimeSeconds: null,
    section: null,
    totalFaults: null,
    trialId,
  };
}

const fixture: EmergencyPacketInput = {
  generatedAt: '2026-10-01T23:00:00.000Z',
  show: {
    id: 'show-pdf',
    name: 'Prairie Fall Trial',
    clubName: 'Prairie Dog Club',
    organization: 'AKC',
    startDate: '2026-10-03',
    endDate: '2026-10-04',
  },
  trials: [
    { id: 't1', date: '2026-10-03', name: 'Saturday', trialNumber: '1', registryId: 'AKC' },
    { id: 't2', date: '2026-10-04', name: 'Sunday', trialNumber: '2', registryId: 'AKC' },
  ],
  classes: [
    {
      id: 'c1',
      trialId: 't1',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      classNumber: '101',
      displayOrder: 1,
      judgeName: 'Judge One',
      ringLabel: 'Ring 1',
      startTime: '08:00',
      timeLimitSeconds: 120,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
      numHides: null,
      distractionCount: null,
    },
    {
      id: 'c2',
      trialId: 't2',
      name: 'Interior Advanced',
      element: 'Interior',
      level: 'Advanced',
      section: null,
      classNumber: '201',
      displayOrder: 1,
      judgeName: 'Judge Two',
      ringLabel: 'Ring 2',
      startTime: '09:30',
      timeLimitSeconds: 180,
      timeLimitArea2Seconds: 120,
      timeLimitArea3Seconds: 90,
      numAreas: null,
      numHides: null,
      distractionCount: null,
    },
  ],
  entries: [
    reportEntry('e1', 'c1', 't1', 101),
    reportEntry('e2', 'c1', 't1', 102),
    reportEntry('e3', 'c2', 't2', 201),
  ],
};

/**
 * Read the text jsPDF actually drew.
 *
 * This suite previously asserted only page count, page size and title — none of
 * which can tell whether a field reached the paper. That blind spot is exactly
 * how the class time limit came to be read from the DB, mapped by the adapter,
 * carried in the type and rendered nowhere for the life of the feature
 * (MYK9-198 mock-trial-day audit). Content streams are Flate-compressed, so a
 * grep of the raw bytes finds nothing and silently passes; they have to be
 * decoded.
 */
/**
 * jsPDF writes text in WinAnsi, so an en dash is the single byte 0x96.
 *
 * Decoding that as UTF-8 yields U+FFFD, and `TextDecoder('windows-1252')`
 * DROPS it outright on this Node build — either way an assertion on real copy
 * ("2026-10-03–2026-10-04") fails while the PDF itself is perfectly correct.
 * Map the bytes explicitly rather than depend on which ICU data is present.
 */
const WINANSI_PUNCTUATION: Record<number, string> = {
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201C',
  0x94: '\u201D',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
};

function decodeWinAnsi(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += WINANSI_PUNCTUATION[byte] ?? String.fromCharCode(byte);
  return out;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const chunks: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFRawStream ? [contents] : [];
    for (const stream of streams) {
      chunks.push(decodeWinAnsi(decodePDFRawStream(stream).decode()));
    }
  }
  // jsPDF emits show-text operators as `(literal) Tj`.
  return chunks.join('\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
}

/**
 * Same decode as `extractPdfText`, scoped to ONE pdf-lib page index — needed
 * to prove a per-page header (like the armband range) carries THAT page's
 * own numbers rather than the whole class's, which `extractPdfText`'s
 * all-pages concatenation cannot distinguish.
 */
async function extractPdfTextForPage(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[pageIndex];
  const contents = page.node.Contents();
  if (!contents) return '';
  const streams = contents instanceof PDFRawStream ? [contents] : [];
  const chunks = streams.map(stream => decodeWinAnsi(decodePDFRawStream(stream).decode()));
  return chunks.join('\n').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
}

/**
 * Render exactly one page of the given kind and capture every string drawn
 * into it, synchronously — no PDF byte decode round-trip.
 *
 * `entryOverrides` merges into EVERY entry fixture (there are two, so a
 * long-value test cannot pass just because it happened to land on the row
 * the assertion forgot to check). `classOverrides` merges into the class
 * fixture; Task 3 does not need it, but Task 4's score-recording tests call
 * this with a third argument, so the signature is final now.
 */
function renderPageOfKind(
  kind: EmergencyPacketPageKind,
  entryOverrides: Partial<ReportEntry> = {},
  classOverrides: Partial<EmergencyPacketClass> = {}
): { doc: Uint8Array; texts: string[] } {
  const input: EmergencyPacketInput = structuredClone(fixture) as EmergencyPacketInput;
  input.trials = [input.trials[0]];
  input.classes = [{ ...input.classes[0], ...classOverrides }];
  input.entries = [
    { ...reportEntry('e1', 'c1', 't1', 101), ...entryOverrides },
    { ...reportEntry('e2', 'c1', 't1', 102), ...entryOverrides },
  ];

  const model = buildEmergencyPacketModel(input);
  const targetPage = model.pages.find(candidate => candidate.kind === kind);
  if (!targetPage)
    throw new Error(`renderPageOfKind: no '${kind}' page was produced by the fixture`);

  const texts: string[] = [];
  // A constructor function that returns an object from `new` hands that
  // object back instead of `this` — this is what lets a real jsPDF instance
  // satisfy `JsPdfConstructor` while every `.text()` call is intercepted.
  const RecordingJsPdf = function (options: ConstructorParameters<typeof jsPDF>[0]) {
    const real = new jsPDF(options);
    const originalText = real.text.bind(real);
    (real as unknown as { text: typeof real.text }).text = ((
      text: Parameters<typeof real.text>[0],
      x: Parameters<typeof real.text>[1],
      y: Parameters<typeof real.text>[2],
      opts?: Parameters<typeof real.text>[3]
    ) => {
      for (const value of Array.isArray(text) ? text : [text]) texts.push(value);
      return originalText(text, x, y, opts);
    }) as typeof real.text;
    return real;
  } as unknown as JsPdfConstructor;

  const doc = buildEmergencyTrialPacketPdfWithCtor(
    { ...model, pages: [{ ...targetPage, pageNumber: 1 }] },
    RecordingJsPdf
  );
  return { doc, texts };
}

/**
 * Render exactly one score-recording block (one entry, so there is no second
 * block to confuse the measurement with) and return the greatest y any
 * element reached, minus the block's own start y.
 *
 * The block's own outer frame (`doc.rect(LEFT, y, RIGHT-LEFT, SCORE_BLOCK_HEIGHT_MM)`)
 * is excluded from the "greatest y reached" measurement — its own bottom edge
 * is BY DEFINITION `SCORE_BLOCK_HEIGHT_MM` below the start, so including it
 * would make this function return that constant no matter what the block's
 * actual content does, which is exactly the vacuous-test shape the mutation
 * check below exists to catch. The frame IS still used to find the block's
 * start y (it is the first wide rect drawn at the left margin).
 */
function blockExtent(classOverrides: Partial<EmergencyPacketClass> = {}): number {
  const input: EmergencyPacketInput = structuredClone(fixture) as EmergencyPacketInput;
  input.trials = [input.trials[0]];
  input.classes = [{ ...input.classes[0], ...classOverrides }];
  input.entries = [reportEntry('e1', 'c1', 't1', 101)];

  const model = buildEmergencyPacketModel(input);
  const targetPage = model.pages.find(candidate => candidate.kind === 'score-recording');
  if (!targetPage) throw new Error('blockExtent: no score-recording page was produced');

  let blockStartY: number | null = null;
  let maxY = 0;
  // The page header/footer (`addPageFrame`) draws BEFORE the block, including
  // a footer fixed at `PAGE_HEIGHT - 8` — a y far larger than anything the
  // block itself draws. Only track calls that happen once the block's own
  // frame has been seen, so the footer (and title, drawn before the block
  // too) cannot inflate the measurement.
  const track = (y: number) => {
    if (blockStartY !== null && y > maxY) maxY = y;
  };
  const isBlockFrame = (x: number, w: number) => x === 14 && w > 100;

  const RecordingJsPdf = function (options: ConstructorParameters<typeof jsPDF>[0]) {
    const real = new jsPDF(options);

    const originalRect = real.rect.bind(real);
    (real as unknown as { rect: typeof real.rect }).rect = ((
      x: number,
      y: number,
      w: number,
      h: number,
      style?: string
    ) => {
      if (isBlockFrame(x, w)) {
        if (blockStartY === null) blockStartY = y;
      } else {
        track(y + h);
      }
      return originalRect(x, y, w, h, style);
    }) as typeof real.rect;

    const originalText = real.text.bind(real);
    (real as unknown as { text: typeof real.text }).text = ((
      text: Parameters<typeof real.text>[0],
      x: Parameters<typeof real.text>[1],
      y: Parameters<typeof real.text>[2],
      opts?: Parameters<typeof real.text>[3]
    ) => {
      track(y);
      return originalText(text, x, y, opts);
    }) as typeof real.text;

    return real;
  } as unknown as JsPdfConstructor;

  buildEmergencyTrialPacketPdfWithCtor(
    { ...model, pages: [{ ...targetPage, pageNumber: 1 }] },
    RecordingJsPdf
  );

  if (blockStartY === null) throw new Error('blockExtent: block start (outer frame) not found');
  return maxY - blockStartY;
}

function checkInColumnGeometry() {
  return {
    columnStarts: CHECK_IN_COLUMNS.map(column => column.x),
    columnWidths: CHECK_IN_COLUMNS.map(column => column.width),
  };
}

describe('buildEmergencyTrialPacketPdf', () => {
  it('prints all eight check-in columns', () => {
    const { doc, texts } = renderPageOfKind('check-in');
    for (const header of [
      'Gate',
      'Order',
      'Armband',
      'Call Name',
      'Breed',
      'Reg #',
      'Handler',
      'Pull / Move / Note',
    ]) {
      expect(texts, header).toContain(header);
    }
    expect(doc).toBeDefined();
  });

  it('keeps every check-in column inside the printable width', () => {
    // jsPDF does not reflow. A column that starts past RIGHT is drawn off-page
    // and simply never appears on paper.
    const { columnStarts, columnWidths } = checkInColumnGeometry();
    const last = columnStarts.length - 1;
    expect(columnStarts[0]).toBeGreaterThanOrEqual(14);
    expect(columnStarts[last] + columnWidths[last]).toBeLessThanOrEqual(215.9 - 14);
  });

  // Every text column, not just breed. Guarding one field and leaving the
  // other six is the same bug with better odds.
  it.each([
    ['breed', 'Nederlandse Kooikerhondje Extremely Long Registered Breed Name'],
    ['callName', 'Bartholomew Fitzgerald Wellington The Third Of Somewhere'],
    ['handler', 'Anastasia Konstantinopoulos-Wetherbottom'],
    ['registrationNumber', 'SR-99999999-XX-ALTERNATE-REGISTRY-LONGFORM'],
  ])('truncates an overlong %s rather than overprinting the next column', (field, value) => {
    const { texts } = renderPageOfKind('check-in', { [field]: value });
    // A bare `value.startsWith(text.slice(0, 8))` is vacuously true for `text
    // === ''` (`startsWith('')` is always true), and every check-in row has
    // two empty ruled cells (gate, note) that sort ahead of every other
    // field in `texts` — so the naive predicate matches the empty gate cell
    // before ever reaching the field under test, and the assertion below
    // passes whether or not truncation happened. Require a real, non-empty
    // prefix match instead.
    const printed = texts.find(text => text.length > 0 && value.startsWith(text.slice(0, 8)));
    expect(printed, `${field} was not printed at all`).toBeDefined();
    expect(printed!.length).toBeLessThan(value.length);
  });

  it('creates one bounded vector PDF page for every modeled paper page', async () => {
    const model = buildEmergencyPacketModel(fixture);
    const bytes = buildEmergencyTrialPacketPdf(model);
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect(pdf.getPageCount()).toBe(model.pages.length);
    for (const page of pdf.getPages()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
    }
    expect(pdf.getTitle()).toBe('Prairie Fall Trial — Emergency Trial Packet');
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_EMERGENCY_PACKET_BYTES);
  });

  /**
   * Whole-branch review finding #7. The emergency packet keeps the red
   * "SNAPSHOT — NOT LIVE" banner and the emergency-packet PDF title; a
   * Reports-originated model (`snapshotMarker: false`) must show neither —
   * a check-in sheet printed on a normal working day is not a stale
   * degraded-mode snapshot, and telling a gate steward it might be is worse
   * than printing nothing at all.
   */
  describe('snapshotMarker suppression', () => {
    it('keeps the snapshot banner and emergency titling for the actual packet', async () => {
      const model = buildEmergencyPacketModel(fixture);
      const bytes = buildEmergencyTrialPacketPdf(model);
      const pdf = await PDFDocument.load(bytes);
      const text = await extractPdfText(bytes);

      expect(pdf.getTitle()).toBe('Prairie Fall Trial — Emergency Trial Packet');
      expect(text).toContain('SNAPSHOT — NOT LIVE');
    });

    it('suppresses the snapshot banner and emergency titling for a Reports-originated model', async () => {
      const model = buildEmergencyPacketModel(fixture, { snapshotMarker: false });
      const bytes = buildEmergencyTrialPacketPdf(model);
      const pdf = await PDFDocument.load(bytes);
      const text = await extractPdfText(bytes);

      expect(pdf.getTitle()).toBe('Prairie Fall Trial');
      expect(pdf.getTitle()).not.toContain('Emergency Trial Packet');
      expect(text).not.toContain('SNAPSHOT — NOT LIVE');
      // Everything else about the page (identity, dates) still prints —
      // only the marker and titling are suppressed.
      expect(text).toContain('Container Novice A');
    });
  });

  it('prints the class maximum on the pages a judge writes on', async () => {
    const model = buildEmergencyPacketModel(fixture);
    const text = await extractPdfText(buildEmergencyTrialPacketPdf(model));

    // Single-area class.
    expect(text).toContain('Max time 2:00');
    // Multi-area class: a sheet showing only area 1 is wrong at areas 2 and 3.
    expect(text).toContain('Area 1 3:00');
    expect(text).toContain('Area 2 2:00');
    expect(text).toContain('Area 3 1:30');
  });

  it('wraps rather than clips when the detail line overflows', async () => {
    // The time limit sits LAST on that line, so truncating it away is the
    // failure mode that matters: a long class name must not cost the judge the
    // one number the ring runs on.
    // `classLabel` builds from element/level/section and the judge name — NOT
    // from `name` — so overflow has to be forced through the fields that
    // actually reach the line.
    const long = structuredClone(fixture) as EmergencyPacketInput;
    long.classes[1].element = 'Interior and Exterior Combined Championship';
    long.classes[1].level = 'Advanced Qualifying Round';
    long.classes[1].judgeName = 'Alexandra Featherstonehaugh-Willoughby';
    const text = await extractPdfText(
      buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(long))
    );

    expect(text).toContain('Area 3 1:30');
    expect(text).not.toContain('...');
  });

  describe('layoutDetailLines', () => {
    // Row batching is fixed in the model, so a taller header eats the table's
    // space rather than repaginating. The header therefore has to be bounded.
    const doc = () => new jsPDF({ unit: 'mm', format: 'letter' });
    const absurd = 'Interior and Exterior Combined Championship Qualifying Round'.repeat(12);

    it('never exceeds the height the fixed row batches leave room for', () => {
      expect(layoutDetailLines(doc(), [absurd], 'Max time 3:00').length).toBeLessThanOrEqual(4);
      expect(
        layoutDetailLines(doc(), [absurd], `Max time — ${'Area 1 3:00 · '.repeat(10)}`).length
      ).toBeLessThanOrEqual(4);
    });

    it('truncates identity rather than the time limit', () => {
      const lines = layoutDetailLines(doc(), [absurd], 'Max time 3:00');
      expect(lines.at(-1)).toBe('Max time 3:00');
      expect(lines.some(line => line.endsWith('...'))).toBe(true);
    });

    it('gives the catalog exactly one line and the writable pages four', () => {
      // The catalog's 24-row batch already ends at 267mm against a 271.4mm
      // footer, so a second line overlaps it. Pin the mapping, not the comment.
      expect(maxDetailLinesForKind('catalog')).toBe(1);
      expect(maxDetailLinesForKind('check-in')).toBe(4);
      expect(maxDetailLinesForKind('score-recording')).toBe(4);
    });

    it('holds a catalog header to one line, whatever the trial is called', () => {
      // A 24-row catalog already ends at 267mm against a 271.4mm footer, so a
      // second header line overlaps it. A trial with a long name and no trial
      // number is the way that happens.
      expect(layoutDetailLines(doc(), [absurd], undefined, 1)).toHaveLength(1);
    });

    it('leaves a short header untouched', () => {
      expect(layoutDetailLines(doc(), ['Trial 1', '2026-10-03'], 'Max time 2:00')).toEqual([
        'Trial 1 · 2026-10-03',
        'Max time 2:00',
      ]);
    });
  });

  it('keeps a long trial name from pushing the catalog table into the footer', async () => {
    const long = structuredClone(fixture) as EmergencyPacketInput;
    // No trial number, so `trialLabel` falls back to the name.
    long.trials[0].trialNumber = '';
    long.trials[0].name =
      'The Greater Prairie Regional Autumn Scent Work Championship and Qualifying Trial';
    const model = buildEmergencyPacketModel(long);
    const bytes = buildEmergencyTrialPacketPdf(model);

    // Renders, stays one page per modeled page, and the trial identity is
    // present rather than dropped outright.
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(model.pages.length);
    const text = await extractPdfText(bytes);
    expect(text).toContain('The Greater Prairie');
  });

  /**
   * Ring is sport-dependent. Scent work — the only sport modeled today — does
   * not use rings, and nothing in the schema persists one, so "Ring unassigned"
   * appeared on every page of every packet. It does not read as neutral: it
   * reads as a forgotten setting, and sends a secretary looking for a control
   * that does not exist. Print where a class runs only when that is known.
   */
  it('says nothing about a ring when the sport does not use one', async () => {
    const ringless = structuredClone(fixture) as EmergencyPacketInput;
    for (const cls of ringless.classes) cls.ringLabel = null;
    const text = await extractPdfText(
      buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(ringless))
    );

    expect(text).not.toContain('Ring unassigned');
    expect(text).not.toContain('Ring');
    // The identity that actually reassembles a dropped stack is still there.
    expect(text).toContain('Container Novice A');
  });

  it('still prints the ring for a sport that has one', async () => {
    const text = await extractPdfText(
      buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(fixture))
    );
    expect(text).toContain('Ring 1');
    expect(text).toContain('Ring 2');
  });

  /**
   * MYK9-228. The fixture runs two trials on two different days. Split by day,
   * each packet must stand alone: its own cover naming its own date, and only
   * its own trial inside. A cover that still said "2026-10-03–2026-10-04"
   * would leave two evenings' stacks indistinguishable at a glance.
   */
  describe('per-day packets', () => {
    it('names its own day and its own trials on the cover', async () => {
      const days = splitPacketInputByTrialDay(fixture);
      expect(days.map(day => day.trialDate)).toEqual(['2026-10-03', '2026-10-04']);

      const saturday = await extractPdfText(
        buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(days[0].input))
      );
      expect(saturday).toContain('This packet covers: 2026-10-03');
      expect(saturday).toContain('Trials in this packet:');
      expect(saturday).toContain('• Saturday');
      expect(saturday).not.toContain('Sunday');
      expect(saturday).not.toContain('2026-10-04');
    });

    it('still prints the whole-show span when the packet holds every day', async () => {
      const text = await extractPdfText(
        buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(fixture))
      );
      expect(text).toContain('This packet covers: 2026-10-03–2026-10-04');
    });

    it('never drops a trial name silently, however many a day holds', async () => {
      // A cover that omits a trial fails at the one job it has. Past the line
      // budget it must SAY how many are missing.
      const busy = structuredClone(fixture) as EmergencyPacketInput;
      busy.trials = Array.from({ length: 7 }, (_, i) => ({
        id: `t${i}`,
        date: '2026-10-03',
        name: `Trial Number ${i}`,
        trialNumber: String(i),
        registryId: 'AKC',
      }));
      busy.classes = busy.classes.map(c => ({ ...c, trialId: 't0' }));
      busy.entries = busy.entries.map(e => ({ ...e, trialId: 't0', classId: busy.classes[0].id }));

      const text = await extractPdfText(
        buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(busy))
      );
      expect(text).toContain('+4 more');
      expect(text).toContain('see the trial sections inside');
    });
  });
});

describe('scoresheet per-dog block', () => {
  it('prints all four result states', () => {
    const { texts } = renderPageOfKind('score-recording');
    for (const state of ['Q', 'NQ', 'EX', 'ABS']) {
      expect(texts).toContain(state);
    }
  });

  it('prints a place field, which only matters when the app is down', () => {
    // INTENT: extra information the judge ignores when the app is up. Do not
    // remove as a simplification — see the spec's "one sheet, superset" note.
    const { texts } = renderPageOfKind('score-recording');
    expect(texts.some(text => text.startsWith('Place'))).toBe(true);
  });

  it('prints the registry reason lists, not a hard-coded set', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { registryId: 'akc' });
    for (const reason of resolveScoresheetConfig('akc').nqReasons) {
      expect(texts).toContain(reason);
    }
  });

  it('prints the three fault counters as tallies', () => {
    const { texts } = renderPageOfKind('score-recording');
    for (const fault of ['Handler Error', 'Safety Concern', 'Mild Disruption']) {
      expect(texts).toContain(fault);
    }
  });

  it('prints MM/SS/TT on every dog block for a single-area class', () => {
    // renderPageOfKind always renders 2 dogs on the page. Every block relabels
    // its own time rows — a judge working down the column, or a page
    // separated from the rest of the packet, must not have to look back to a
    // "header" block to know which box is which (round 1 finding #2).
    const { texts } = renderPageOfKind('score-recording', {}, { numAreas: 1 });
    expect(texts.filter(text => text === 'MM')).toHaveLength(2);
    expect(texts.filter(text => text === 'SS')).toHaveLength(2);
    expect(texts.filter(text => text === 'TT')).toHaveLength(2);
    expect(texts).not.toContain('A2');
  });

  it('prints per-area rows plus a total on every dog block for a multi-area class', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { numAreas: 3 });
    for (const label of ['A1', 'A2', 'A3', 'Total']) {
      expect(texts.filter(text => text === label)).toHaveLength(2);
    }
  });

  /**
   * Whole-branch review finding #6: `resolveAreaCount` clamps to `MAX_AREAS`
   * (10), and the time stack drew `areaCount + 1` rows unconditionally — at
   * 6 areas the `Total` box lands 6.5mm INTO the next dog's block. Drive
   * `numAreas` past the point where all rows would fit and prove the block
   * stays bounded regardless.
   */
  it('keeps a large area count from overflowing the block, via a visible overflow marker', () => {
    for (const numAreas of [5, 6, 10]) {
      expect(blockExtent({ numAreas }), `numAreas=${numAreas}`).toBeLessThanOrEqual(
        SCORE_BLOCK_HEIGHT_MM
      );
    }
    const { texts } = renderPageOfKind('score-recording', {}, { numAreas: 6 });
    // Every area up to the row budget still gets its own box...
    for (const label of ['A1', 'A2', 'A3']) {
      expect(texts.filter(text => text === label)).toHaveLength(2);
    }
    // ...and the ones that don't fit are named, not silently dropped.
    expect(texts.filter(text => text === '+3')).toHaveLength(2);
    expect(texts.filter(text => text === 'Total')).toHaveLength(2);
    expect(texts).not.toContain('A4');
  });

  it('keeps the multi-area time stack inside the block height', () => {
    // The four time rows must fit the height the reason lists already set, or
    // pagination silently overflows for 3-area classes only.
    const single = blockExtent({ numAreas: 1 });
    const multi = blockExtent({ numAreas: 3 });
    expect(multi).toBeLessThanOrEqual(SCORE_BLOCK_HEIGHT_MM);
    expect(single).toBeLessThanOrEqual(SCORE_BLOCK_HEIGHT_MM);
  });

  it(`keeps at least ${MIN_BLOCK_MARGIN_MM}mm of margin below SCORE_BLOCK_HEIGHT_MM today`, () => {
    // The real risk isn't today's content — it's a registry config gaining a
    // 6th reason, or a font-metric shift, silently overflowing into the next
    // block (round 1 finding #4). This asserts today's margin is safe; the
    // next test proves the assertion is actually sensitive to that risk.
    const margin = SCORE_BLOCK_HEIGHT_MM - blockExtent();
    expect(margin).toBeGreaterThanOrEqual(MIN_BLOCK_MARGIN_MM);
  });

  it('would violate the margin guard if a registry gained a 6th NQ reason', () => {
    // Mutates the LIVE, shared SCORESHEET_CONFIGS object (not a mock/spy) for
    // the duration of this one test, restored in `finally` so no other test —
    // including a shuffled run — can observe the mutated list.
    const akcConfig = SCORESHEET_CONFIGS.akc as unknown as { nqReasons: string[] };
    const originalNqReasons = akcConfig.nqReasons;
    akcConfig.nqReasons = [...originalNqReasons, 'Extra Overflow Reason'];
    try {
      const margin = SCORE_BLOCK_HEIGHT_MM - blockExtent({ registryId: 'akc' });
      expect(margin).toBeLessThan(MIN_BLOCK_MARGIN_MM);
    } finally {
      akcConfig.nqReasons = originalNqReasons;
    }
  });

  it('renders the registry-specific scoresheet title, not a hard-coded one', () => {
    // `orgTitle` was previously computed and never drawn anywhere — dead
    // config surface (round 1 finding #3). Rendering it as the page title
    // also gives the registry-reasons test above real per-registry surface:
    // a renderer that silently fell back to the generic config would now
    // fail THIS assertion even on today's identical reason lists.
    const { texts } = renderPageOfKind('score-recording', {}, { registryId: 'akc' });
    expect(texts).toContain(`${resolveScoresheetConfig('akc').orgTitle} Scoresheet`);
  });

  it('prints hides and distractions on the class header when configured', () => {
    const { texts } = renderPageOfKind('score-recording', {}, { numHides: 3, distractionCount: 2 });
    expect(texts.some(text => text.includes('Hides: 3'))).toBe(true);
    expect(texts.some(text => text.includes('Distractions: 2'))).toBe(true);
  });

  it('prints neither hides nor distractions when not configured', () => {
    const { texts } = renderPageOfKind(
      'score-recording',
      {},
      { numHides: null, distractionCount: null }
    );
    expect(texts.some(text => text.includes('Hides:'))).toBe(false);
    expect(texts.some(text => text.includes('Distractions:'))).toBe(false);
  });

  /**
   * Whole-branch review finding #1: breed, reg # and handler used to share
   * ONE 51mm line at 7pt. `Labrador Retriever · SR12345601 · Jennifer
   * Martinez` measures 57.7mm — past the region's ~51mm budget — so
   * `fitTextToWidth` silently ate the tail, usually the handler. Drive a
   * long breed AND a long handler through the same block and assert BOTH
   * still print identifiably (not merely "something truncated survived").
   */
  it('prints a long breed and a long handler both identifiably, not truncated into each other', () => {
    const longBreed = 'Nederlandse Kooikerhondje Extremely Long Registered Breed Name';
    const longHandler = 'Anastasia Konstantinopoulos-Wetherbottom Featherstonehaugh';
    const { texts } = renderPageOfKind('score-recording', {
      breed: longBreed,
      handler: longHandler,
      registrationNumber: 'SR-99999999-XX',
    });

    // Every one of the two fields must have its OWN printed line whose
    // non-empty prefix genuinely matches that field's own value — a bare
    // `startsWith` against the whole `texts` array is vacuous if a single
    // merged (and truncated) line happened to start with the breed.
    const breedLine = texts.find(text => text.length > 0 && longBreed.startsWith(text.slice(0, 8)));
    const handlerLine = texts.find(
      text => text.length > 0 && longHandler.startsWith(text.slice(0, 8))
    );
    expect(breedLine, 'breed was not printed at all').toBeDefined();
    expect(handlerLine, 'handler was not printed at all').toBeDefined();
    // They must be genuinely separate strings jsPDF drew — proof the fix put
    // them on their own lines rather than one truncating over the other.
    expect(breedLine).not.toBe(handlerLine);
    // Still truncated (never overprinted) since these values also overflow
    // their own single line at this width.
    expect(breedLine!.length).toBeLessThan(longBreed.length);
    expect(handlerLine!.length).toBeLessThan(longHandler.length);
  });

  it('prints the armband range for the entries on this page', () => {
    // renderPageOfKind always renders exactly 2 dogs, armbands 101 and 102.
    // The header is one wrapped line at this length, not a separate array
    // entry, so search substrings the same way the hides/distractions
    // assertions above do.
    const { texts } = renderPageOfKind('score-recording');
    expect(texts.some(text => text.includes('Armbands 101\u2013102'))).toBe(true);
  });

  it('prints a single armband, not a range, for a one-dog page', () => {
    const input: EmergencyPacketInput = structuredClone(fixture) as EmergencyPacketInput;
    input.trials = [input.trials[0]];
    input.classes = [input.classes[0]];
    input.entries = [reportEntry('solo', 'c1', 't1', 150)];
    const model = buildEmergencyPacketModel(input);
    const scorePage = model.pages.find(page => page.kind === 'score-recording');
    if (!scorePage) throw new Error('expected a score-recording page');

    const capturedTexts: string[] = [];
    const RecordingJsPdf = function (options: ConstructorParameters<typeof jsPDF>[0]) {
      const real = new jsPDF(options);
      const originalText = real.text.bind(real);
      (real as unknown as { text: typeof real.text }).text = ((
        text: Parameters<typeof real.text>[0],
        x: Parameters<typeof real.text>[1],
        y: Parameters<typeof real.text>[2],
        opts?: Parameters<typeof real.text>[3]
      ) => {
        for (const value of Array.isArray(text) ? text : [text]) capturedTexts.push(value);
        return originalText(text, x, y, opts);
      }) as typeof real.text;
      return real;
    } as unknown as JsPdfConstructor;

    buildEmergencyTrialPacketPdfWithCtor(
      { ...model, pages: [{ ...scorePage, pageNumber: 1 }] },
      RecordingJsPdf
    );

    expect(capturedTexts.some(text => text.includes('Armband 150'))).toBe(true);
    expect(capturedTexts.some(text => text.includes('Armbands'))).toBe(false);
  });

  /**
   * Round-1 finding #1 (task-5 review): the previous continuation-page test
   * asserted the `(2/3)` title suffix and the class label, but never the
   * armband range the spec actually requires for identifying a separated
   * page. This proves each page prints ITS OWN entries' range — not the
   * whole class's 101-112 — by decoding each PDF page independently.
   */
  it('prints the armband range for the entries actually on that page, not the whole class', async () => {
    const twelveDogClass: EmergencyPacketInput = structuredClone(fixture) as EmergencyPacketInput;
    twelveDogClass.trials = [twelveDogClass.trials[0]];
    twelveDogClass.classes = [twelveDogClass.classes[0]];
    twelveDogClass.entries = Array.from({ length: 12 }, (_, index) =>
      reportEntry(`entry-${index}`, 'c1', 't1', 101 + index)
    );

    const model = buildEmergencyPacketModel(twelveDogClass);
    const scorePageIndexes = model.pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.kind === 'score-recording')
      .map(({ index }) => index);
    // SCORE_ROWS_FIRST_PAGE = SCORE_ROWS_CONTINUATION = 5: 12 dogs -> 5, 5, 2.
    expect(scorePageIndexes).toHaveLength(3);

    const bytes = buildEmergencyTrialPacketPdf(model);
    const [firstText, continuationText, lastText] = await Promise.all(
      scorePageIndexes.map(index => extractPdfTextForPage(bytes, index))
    );

    expect(firstText).toContain('Armbands 101\u2013105');
    expect(continuationText).toContain('Armbands 106\u2013110');
    expect(lastText).toContain('Armbands 111\u2013112');
    // Each page's range is its OWN, not the whole class's 101-112.
    expect(firstText).not.toContain('Armbands 106');
    expect(continuationText).not.toContain('Armbands 101');
  });

  /**
   * Round-1 finding #3 (task-5 review): `SCORE_ROWS_FIRST_PAGE`/
   * `SCORE_ROWS_CONTINUATION` (emergencyTrialPacket.ts) and
   * `SCORE_BLOCK_HEIGHT_MM` (this module) can't import each other —
   * emergencyTrialPacket.ts builds the model that this module renders, so
   * the reverse import would cycle. That makes their agreement structural,
   * not enforced by the type system, so a future change to either constant
   * (or to the header's line budget) can silently reopen the 1.6mm overflow
   * this task fixed. This test imports both modules and re-derives the same
   * worst case documented above `MAX_DETAIL_LINES`, so a future edit fails
   * HERE instead of on a printed page.
   */
  it('keeps score rows, block height, and the worst-case header inside the footer', () => {
    const worstCaseHeaderLines = maxDetailLinesForKind('score-recording');
    const worstCaseTableTopY = TITLE_BASE_Y + (worstCaseHeaderLines - 1) * DETAIL_LINE_HEIGHT;

    const firstPageBottomY = worstCaseTableTopY + SCORE_ROWS_FIRST_PAGE * SCORE_BLOCK_HEIGHT_MM;
    const continuationBottomY =
      worstCaseTableTopY + SCORE_ROWS_CONTINUATION * SCORE_BLOCK_HEIGHT_MM;

    expect(firstPageBottomY).toBeLessThanOrEqual(PAGE_FOOTER_Y_MM);
    expect(continuationBottomY).toBeLessThanOrEqual(PAGE_FOOTER_Y_MM);

    // Prove the guard is actually sensitive to the risk it exists for: one
    // more row than SCORE_ROWS_CONTINUATION, at the worst-case header, must
    // overflow — this is the exact 1.6mm this task's measurement found.
    const oneRowMore = worstCaseTableTopY + (SCORE_ROWS_CONTINUATION + 1) * SCORE_BLOCK_HEIGHT_MM;
    expect(oneRowMore).toBeGreaterThan(PAGE_FOOTER_Y_MM);
  });
});
