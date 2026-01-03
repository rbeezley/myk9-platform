import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDF_PATH = String.raw`D:\Access 2013 Applications\mySWT Build\full version 2.7.14\Documents\Scent_Work_Regulations.pdf`;

async function main() {
  const dataBuffer = new Uint8Array(fs.readFileSync(PDF_PATH));
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const doc = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
  }

  // Find Buried Master section
  const buriedMasterIdx = fullText.indexOf('Buried Master Class :');
  if (buriedMasterIdx >= 0) {
    const extract = fullText.substring(buriedMasterIdx, buriedMasterIdx + 2000);
    console.log('=== Raw PDF Text (2000 chars after "Buried Master Class :") ===\n');
    console.log(extract);
    console.log('\n=== Looking for what stops the regex ===');

    // Check for patterns that would stop the regex
    const stopPatterns = [
      'Container Novice', 'Container Advanced', 'Container Excellent', 'Container Master',
      'Interior Novice', 'Interior Advanced', 'Interior Excellent', 'Interior Master',
      'Exterior Novice', 'Exterior Advanced', 'Exterior Excellent', 'Exterior Master',
      'Buried Novice', 'Buried Advanced', 'Buried Excellent',
      'CHAPTER'
    ];

    for (const pattern of stopPatterns) {
      const idx = extract.indexOf(pattern);
      if (idx >= 0 && idx > 0) {
        console.log(`Found "${pattern}" at position ${idx}`);
      }
    }
  }
}

main();
