import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Each page's content streams, decoded, in drawing order. */
export async function pageContentStreams(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(page => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return refs.map(ref => {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) throw new Error('unexpected content stream');
      return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    });
  });
}

/** The shown text of one decoded content stream: `(literal) Tj` and `<hex> Tj` runs, joined. */
export function shownText(stream: string): string {
  const runs: string[] = [];
  for (const match of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f]+)>\s*Tj/g)) {
    if (match[1] !== undefined) runs.push(match[1].replace(/\\(.)/g, '$1'));
    else if (match[2]) {
      const hex = match[2];
      let text = '';
      for (let i = 0; i < hex.length; i += 2)
        text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      runs.push(text);
    }
  }
  return runs.join(' ');
}
