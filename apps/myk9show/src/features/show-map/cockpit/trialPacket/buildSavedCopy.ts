import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';

/**
 * Builds one day's packet with the renderer the nightly job uses, so the copy matches page for
 * page. pdf-lib, jsPDF and the renderer load here, when the secretary presses the button, and
 * not with the panel (bundle budget).
 */
export async function buildSavedCopy(input: EmergencyPacketInput) {
  const [pdfLib, jspdf, renderer] = await Promise.all([
    import('pdf-lib'),
    import('jspdf'),
    import('../../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketDay.ts'),
  ]);
  return renderer.buildTrialDayPacketPdf({
    input,
    pdfLib: {
      PDFDocument: pdfLib.PDFDocument,
      StandardFonts: pdfLib.StandardFonts,
      rgb: pdfLib.rgb,
    },
    JsPdf: jspdf.jsPDF,
    printedAt: new Date(input.generatedAt),
  });
}
