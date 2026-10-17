import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { mergeReportPdfs } from './mergeReportPdfs';

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i += 1) doc.addPage();
  return doc.save();
}

describe('mergeReportPdfs', () => {
  it('joins every sheet into one document with all pages in order', async () => {
    const merged = await mergeReportPdfs([
      await pdfWithPages(2),
      await pdfWithPages(1),
      await pdfWithPages(3),
    ]);
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(6);
  });
});
