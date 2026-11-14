import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FOOTER_SIZE = 7;
const FOOTER_BASELINE = 12;

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

/** The footer's three parts as the plan words them (docs/plan-print-packets.md, cover sheet). */
export function packetFooterText(
  judgeName: string,
  printedAt: Date,
  timeZone: string,
  page: number,
  pageCount: number
): { left: string; right: string } {
  return {
    left: `${judgeName}. Printed ${formatPrintedAt(printedAt, timeZone)}. Later changes are in the app.`,
    right: `Packet page ${page} of ${pageCount}`,
  };
}

/** Stamps the footer on every page of one judge's packet: the cover and every class page. */
export async function stampPacketFooter(
  pdf: Uint8Array,
  judgeName: string,
  printedAt: Date,
  timeZone: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
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
    const options = { size: FOOTER_SIZE, font, color: rgb(0.35, 0.35, 0.35) };
    page.drawText(left, { ...options, x: 36, y: FOOTER_BASELINE });
    page.drawText(right, {
      ...options,
      x: width - 36 - font.widthOfTextAtSize(right, FOOTER_SIZE),
      y: FOOTER_BASELINE,
    });
  });
  return doc.save();
}
