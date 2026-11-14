import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FOOTER_SIZE = 7;
const FOOTER_BASELINE = 12;

/** "Dec 6, 2:00 PM": when the packet was built, in the secretary's own clock. */
export function formatPrintedAt(at: Date): string {
  return at.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The footer's three parts as the plan words them (docs/plan-print-packets.md, cover sheet). */
export function packetFooterText(
  judgeName: string,
  printedAt: Date,
  page: number,
  pageCount: number
): { left: string; right: string } {
  return {
    left: `${judgeName}. Printed ${formatPrintedAt(printedAt)}. Later changes are in the app.`,
    right: `Page ${page} of ${pageCount}`,
  };
}

/** Stamps the footer on every page of one judge's packet: the cover and every class page. */
export async function stampPacketFooter(
  pdf: Uint8Array,
  judgeName: string,
  printedAt: Date
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const { left, right } = packetFooterText(judgeName, printedAt, index + 1, pages.length);
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
