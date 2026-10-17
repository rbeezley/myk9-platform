import { PDFDocument } from 'pdf-lib';

/** Joins PDFs into one document, in order, so a batch of sheets is ONE print job. */
export async function mergeReportPdfs(parts: readonly Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const part of parts) {
    const source = await PDFDocument.load(part);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}
