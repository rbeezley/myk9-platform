import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDF_PATH = String.raw`D:\Access 2013 Applications\mySWT Build\full version 2.7.14\Documents\Scent_Work_Regulations.pdf`;

async function main() {
  console.log('Reading PDF...');
  const dataBuffer = new Uint8Array(fs.readFileSync(PDF_PATH));
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const pdfDocument = await loadingTask.promise;

  // Extract text from all pages
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  // Find Chapter 7
  const chapter7StartIdx = fullText.indexOf('CHAPTER 7');
  const chapter8Idx = fullText.indexOf('CHAPTER 8', chapter7StartIdx);
  const chapter7Text = chapter8Idx >= 0
    ? fullText.substring(chapter7StartIdx, chapter8Idx)
    : fullText.substring(chapter7StartIdx);

  console.log('Chapter 7 text length:', chapter7Text.length);

  // Test the Buried Master regex
  const element = 'Buried';
  const level = 'Master';

  const pattern = new RegExp(`${element}\\s+${level}\\s+Class\\s*:(.*?)(?=${element}\\s+(?:Novice|Advanced|Excellent|Master)|Interior|Exterior|Buried|Container|CHAPTER|$)`, 's');

  console.log('\nSearching for:', `${element} ${level} Class :`);

  const match = chapter7Text.match(pattern);

  if (match) {
    console.log('\n✓ Match found!');
    console.log('Full match length:', match[0].length);
    console.log('Captured content length:', match[1].trim().length);
    console.log('\n=== Captured Content ===');
    console.log(match[1].trim());

    // Show what comes after
    const matchEndIdx = chapter7Text.indexOf(match[0]) + match[0].length;
    console.log('\n=== Next 500 characters after match ===');
    console.log(chapter7Text.substring(matchEndIdx, matchEndIdx + 500));
  } else {
    console.log('✗ No match found');
  }
}

main().catch(console.error);
