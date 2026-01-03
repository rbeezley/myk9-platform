import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PDF_PATH = path.join(__dirname, '..', 'data', 'akc-scent-work-regulations.pdf');

async function debugMasterBuried() {
  const dataBuffer = new Uint8Array(fs.readFileSync(PDF_PATH));
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  // Find "Buried Master" section
  const buriedMasterMatch = fullText.match(/Buried\s+Master\s+Class:(.{0,2000})/is);
  if (buriedMasterMatch) {
    console.log('=== BURIED MASTER CLASS SECTION ===\n');
    console.log(buriedMasterMatch[0]);
    console.log('\n=== END OF SECTION ===');
  } else {
    console.log('❌ Could not find "Buried Master Class" section');
  }
}

debugMasterBuried().catch(console.error);
