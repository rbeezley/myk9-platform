import {
  drawJudgeCoverPdf,
  buildJudgeCoverModel,
  type CoverPdfConstructor,
} from './judgeCoverSheet.ts';
import type { PacketJudge } from './judgePacketCollation.ts';

/**
 * Assembles one judge's packet PDF (MYK9-2085): the cover sheet, each class's sheets in order,
 * and the footer stamped on every page. pdf-lib arrives as an argument, as jsPDF does elsewhere
 * in this directory, so Deno loads it as `npm:pdf-lib` and the browser from its own bundle.
 */

const FOOTER_SIZE = 7;
const FOOTER_BASELINE = 12;

/**
 * The slice of pdf-lib the packet uses; the real module satisfies it structurally. Font and
 * color options are `never` because pdf-lib's own types for them are not ours to name here:
 * `never` accepts the real module, and the caller's values are cast where they are used.
 */
export interface PdfLibFont {
  widthOfTextAtSize(text: string, size: number): number;
}
export interface PdfLibPage {
  getSize(): { width: number };
  drawText(
    text: string,
    options: { size: number; font: never; color: never; x: number; y: number }
  ): unknown;
}
export interface PdfLibDocument {
  addPage(page: never): unknown;
  copyPages(source: never, indices: number[]): Promise<unknown[]>;
  embedFont(font: never): Promise<PdfLibFont>;
  getPageIndices(): number[];
  getPages(): PdfLibPage[];
  save(): Promise<Uint8Array>;
}
export interface PdfLibModule {
  PDFDocument: {
    create(): Promise<PdfLibDocument>;
    load(bytes: Uint8Array): Promise<PdfLibDocument>;
  };
  StandardFonts: { Helvetica: unknown };
  rgb(red: number, green: number, blue: number): unknown;
}

/** What merging needs of a pdf-lib document. */
export interface PdfLibMergeDocument {
  addPage(page: never): unknown;
  copyPages(source: never, indices: number[]): Promise<unknown[]>;
  getPageIndices(): number[];
  save(): Promise<Uint8Array>;
}

/** Joins PDFs into one document, in order, so a batch of sheets is ONE print job. */
export async function mergePdfParts(
  pdfLib: {
    PDFDocument: {
      create(): Promise<PdfLibMergeDocument>;
      load(bytes: Uint8Array): Promise<PdfLibMergeDocument>;
    };
  },
  parts: readonly Uint8Array[]
): Promise<Uint8Array> {
  const merged = await pdfLib.PDFDocument.create();
  for (const part of parts) {
    const source = await pdfLib.PDFDocument.load(part);
    const pages = await merged.copyPages(source as never, source.getPageIndices());
    for (const page of pages) merged.addPage(page as never);
  }
  return merged.save();
}

/**
 * "Dec 6, 1:00 PM": when the packet was built, on the show's clock (the trial's time zone), so
 * the paper reads the same wherever it is printed. Newer ICU puts a narrow no-break space before
 * AM/PM, which the PDF's standard font cannot draw, so spaces are normalised.
 */
export function formatPrintedAt(at: Date, timeZone: string): string {
  return at
    .toLocaleString('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(/\s/g, ' ');
}

/** The characters WinAnsi adds above Latin-1's printable range (0x80-0x9F). */
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
/** Letters that do not decompose into a base letter plus an accent. */
const LETTER_FALLBACKS: Record<string, string> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  ı: 'i',
  Ħ: 'H',
  ħ: 'h',
};

/**
 * Text pdf-lib's standard Helvetica can encode. It throws on anything outside WinAnsi, and one
 * judge named "Łukasz" would otherwise cost the whole packet.
 *
 * The name is composed first (NFC), so "e" plus a separate accent is one letter "é", then read one
 * letter-with-its-accents at a time: a letter WinAnsi has stays, one it lacks drops its accents to
 * the base letter, a stray accent with no letter is dropped, and anything else becomes "?".
 */
export function winAnsiSafe(text: string): string {
  const letters = text.normalize('NFC').match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
  return letters
    .map(letter => {
      if (isWinAnsi(letter)) return letter;
      const base = letter.normalize('NFD').replace(/\p{M}/gu, '');
      if (base === '') return '';
      if (isWinAnsi(base)) return base;
      return LETTER_FALLBACKS[base] ?? '?';
    })
    .join('');
}

/** One character WinAnsi can encode (a letter carrying an accent it lacks is two, so not one). */
function isWinAnsi(char: string): boolean {
  if (Array.from(char).length !== 1) return false;
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(char)
  );
}

/** The footer's two parts as the plan words them (docs/plan-print-packets.md, cover sheet). */
export function packetFooterText(
  judgeName: string,
  printedAt: Date,
  timeZone: string,
  page: number,
  pageCount: number
): { left: string; right: string } {
  return {
    left: winAnsiSafe(
      `${judgeName}. Printed ${formatPrintedAt(printedAt, timeZone)}. Later changes are in the app.`
    ),
    right: `Packet page ${page} of ${pageCount}`,
  };
}

/** Stamps the footer on every page of one judge's packet: the cover and every class page. */
export async function stampJudgePacketFooter(
  pdfLib: PdfLibModule,
  pdf: Uint8Array,
  judgeName: string,
  printedAt: Date,
  timeZone: string
): Promise<Uint8Array> {
  const doc = await pdfLib.PDFDocument.load(pdf);
  const font = await doc.embedFont(pdfLib.StandardFonts.Helvetica as never);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const { left, right } = packetFooterText(
      judgeName,
      printedAt,
      timeZone,
      index + 1,
      pages.length
    );
    const { width } = page.getSize();
    const options = {
      size: FOOTER_SIZE,
      font: font as never,
      color: pdfLib.rgb(0.35, 0.35, 0.35) as never,
    };
    page.drawText(left, { ...options, x: 36, y: FOOTER_BASELINE });
    page.drawText(right, {
      ...options,
      x: width - 36 - font.widthOfTextAtSize(right, FOOTER_SIZE),
      y: FOOTER_BASELINE,
    });
  });
  return doc.save();
}

export interface AssembleJudgePacketOptions {
  pdfLib: PdfLibModule;
  JsPdf: CoverPdfConstructor;
  packet: { trialLabel: string; trialDate: string | null | undefined; registryName: string };
  judge: PacketJudge;
  showName: string;
  /** Every class's sheets (check-in, then scoresheet), already in the judge's class order. */
  classParts: readonly Uint8Array[];
  printedAt: Date;
  /** The trial's IANA time zone: the footer prints on the show's clock. */
  timeZone: string;
}

/** The cover sheet, then each class's sheets, as one PDF with the packet footer on every page. */
export async function assembleJudgePacketPdf(
  options: AssembleJudgePacketOptions
): Promise<Uint8Array> {
  const cover = drawJudgeCoverPdf(
    buildJudgeCoverModel(options.packet, options.judge, options.showName),
    options.JsPdf
  );
  const merged = await mergePdfParts(options.pdfLib, [cover, ...options.classParts]);
  return stampJudgePacketFooter(
    options.pdfLib,
    merged,
    options.judge.judgeName ?? 'No judge assigned',
    options.printedAt,
    options.timeZone
  );
}
