import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/**
 * Reads the literal strings a page's content stream actually draws with `Tj`
 * (both `(...)Tj` and hex `<...>Tj`, the two forms pdf-lib emits) — the
 * rendered-text half of MYK9-828's "every check reads the filled PDF, not
 * builder output": these marks have no AcroForm field, so `form.getTextField`
 * cannot see them.
 */
export async function extractDrawnPdfText(pdfBytes: Uint8Array, pageIndex = 0): Promise<string[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  const page = pdf.getPages()[pageIndex];
  if (!page) return [];

  const contentsRef = page.node.get(PDFName.of('Contents'));
  const contents = contentsRef ? pdf.context.lookup(contentsRef) : undefined;
  const streams =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, i) => pdf.context.lookup(contents.get(i)))
      : [contents];

  let raw = '';
  for (const stream of streams) {
    if (stream instanceof PDFRawStream) {
      raw += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    }
  }

  const results: string[] = [];
  const literalPattern = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  for (const match of raw.matchAll(literalPattern)) {
    results.push(match[1].replace(/\\(.)/g, '$1'));
  }

  const hexPattern = /<([0-9A-Fa-f]+)>\s*Tj/g;
  for (const match of raw.matchAll(hexPattern)) {
    const hex = match[1];
    let text = '';
    for (let i = 0; i + 1 < hex.length; i += 2) {
      text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    }
    results.push(text);
  }

  return results;
}
