import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { stampJudgePacketFooter } from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketPdf.ts';

// The footer text and its stamping live in the shared renderer (MYK9-2085). Only the pdf-lib
// binding is the app's.
export {
  formatPrintedAt,
  packetFooterText,
} from '../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketPdf.ts';

/** Stamps the footer on every page of one judge's packet: the cover and every class page. */
export function stampPacketFooter(
  pdf: Uint8Array,
  judgeName: string,
  printedAt: Date,
  timeZone: string
): Promise<Uint8Array> {
  return stampJudgePacketFooter(
    { PDFDocument, StandardFonts, rgb },
    pdf,
    judgeName,
    printedAt,
    timeZone
  );
}
