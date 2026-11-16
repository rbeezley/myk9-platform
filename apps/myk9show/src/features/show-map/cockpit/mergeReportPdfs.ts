import { PDFDocument } from 'pdf-lib';

import { mergePdfParts } from '../../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketPdf.ts';

/** Joins PDFs into one document, in order, so a batch of sheets is ONE print job. */
export function mergeReportPdfs(parts: readonly Uint8Array[]): Promise<Uint8Array> {
  return mergePdfParts({ PDFDocument }, parts);
}
