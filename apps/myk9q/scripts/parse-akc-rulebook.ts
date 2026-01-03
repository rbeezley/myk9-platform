import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * AKC Scent Work Rulebook Parser
 * Extracts rules from the PDF and structures them for database insertion
 */

interface ParsedRule {
  section: string;
  title: string;
  content: string;
  level: string | null;
  element: string | null;
  category: string;
  keywords: string[];
  measurements: Record<string, any>;
}

// Path to the AKC Scent Work Regulations PDF
const PDF_PATH = path.join(__dirname, '..', 'data', 'akc-scent-work-regulations.pdf');

// Regex patterns for identifying content
const LEVEL_PATTERNS = {
  Novice: /\bnovice\b/i,
  Advanced: /\badvanced\b/i,
  Excellent: /\bexcellent\b/i,
  Master: /\bmaster\b/i,
};

const ELEMENT_PATTERNS = {
  Interior: /\binterior\b/i,
  Exterior: /\bexterior\b/i,
  Container: /\bcontainer\b/i,
  Buried: /\bburied\b/i,
};

// Measurement extraction patterns
// Word-to-number mapping for parsing text
const WORD_TO_NUMBER: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
  'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
};

const MEASUREMENT_PATTERNS = {
  area_sq_ft: /(?:at least\s*)?(\d+)\s*(?:(?:to|and no more than)\s*(\d+))?\s*square\s*feet/i,
  time_minutes: /((?:\d+)|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten))\s*minute[s]?/i,
  warning_seconds: /(\d+)\s*second\s*warning/i,
  // Enhanced hide patterns - capture ranges, single numbers, and "unknown" indicators
  hides: /(?:Hides?:\s*)?(\d+)\s*(?:[-–to]\s*(\d+))?\s*(?:\(?\s*[Uu]nknown\s*\)?)?/i,
  hides_range: /(\d+)\s*[-–]\s*(\d+)\s*hide[s]?/i,
  hides_table: /Hides?:\s*(\d+)\s*[-–]?\s*(\d+)?(?:\s*\(?\s*([Uu]nknown|[Kk]nown)\s*\)?)?/i,
  // Height only matches when explicitly about height/tall/high, not general measurements
  height_inches: /(?:height|tall|high).*?(\d+)\s*(?:to\s*(\d+))?\s*(?:inch|")(?:es)?/i,
  // Spacing pattern for container distances
  spacing_inches: /(?:distance|spacing|apart).*?(\d+)\s*(?:inch|")(?:es)?/i,
  leash_feet: /(\d+)\s*foot\s*leash/i,
  containers: /(\d+)\s*(?:identical\s*)?(?:cardboard\s*)?(?:box\s*)?containers/i,
};

/**
 * Extract level from text
 */
function extractLevel(text: string): string | null {
  for (const [level, pattern] of Object.entries(LEVEL_PATTERNS)) {
    if (pattern.test(text)) {
      return level;
    }
  }
  return null;
}

/**
 * Extract element from text
 */
function extractElement(text: string): string | null {
  for (const [element, pattern] of Object.entries(ELEMENT_PATTERNS)) {
    if (pattern.test(text)) {
      return element;
    }
  }
  return null;
}

/**
 * Map level names to table column indices (0-based)
 * Tables typically have columns: Novice | Advanced | Excellent | Master
 */
const LEVEL_TO_INDEX: Record<string, number> = {
  'Novice': 0,
  'Advanced': 1,
  'Excellent': 2,
  'Master': 3,
};

/**
 * Extract measurements from text - ENHANCED version
 * @param text - The text content to extract measurements from
 * @param level - Optional level (Novice/Advanced/Excellent/Master) for table column selection
 */
function extractMeasurements(text: string, level?: string): Record<string, any> {
  const measurements: Record<string, any> = {};

  // Square feet (area)
  const areaMatch = text.match(MEASUREMENT_PATTERNS.area_sq_ft);
  if (areaMatch) {
    measurements.min_area_sq_ft = parseInt(areaMatch[1]);
    if (areaMatch[2]) {
      measurements.max_area_sq_ft = parseInt(areaMatch[2]);
    }
  }

  // Time in minutes
  const timeMatch = text.match(MEASUREMENT_PATTERNS.time_minutes);
  if (timeMatch) {
    const timeStr = timeMatch[1].toLowerCase();
    // Convert word form to number if needed (e.g., "two" -> 2)
    measurements.time_limit_minutes = WORD_TO_NUMBER[timeStr] !== undefined
      ? WORD_TO_NUMBER[timeStr]
      : parseInt(timeStr);
  }

  // Warning seconds
  const warningMatch = text.match(MEASUREMENT_PATTERNS.warning_seconds);
  if (warningMatch) {
    measurements.warning_seconds = parseInt(warningMatch[1]);
  }

  // Hides - enhanced to capture from tables and narrative text

  // First check for narrative "one, two, three, or four" pattern (Master level)
  const narrativeMatch = text.match(/(?:one|1),?\s*(?:two|2),?\s*(?:three|3),?\s*(?:or|and)?\s*(?:four|4)\s*(?:of the boxes|hides)?/i);
  if (narrativeMatch && /unknown/i.test(text)) {
    measurements.min_hides = 1;
    measurements.max_hides = 4;
    measurements.hides_known = false;
  }

  // Try table row pattern: "1-4 (Unknown)" at end of row
  if (measurements.min_hides === undefined) {
    // Look for patterns like "1 (Known)   2 (Known)   3 (Known)   1-4 (Unknown)"
    // Match ALL hide entries and select based on level (Novice=0, Advanced=1, Excellent=2, Master=3)
    const allHideMatches = Array.from(text.matchAll(/(\d+)(?:-(\d+))?\s*\(\s*([Uu]nknown|[Kk]nown)\s*\)/g));
    if (allHideMatches.length > 0) {
      // Select match based on level, or fall back to last match if level not provided
      let matchIndex: number;
      if (level && LEVEL_TO_INDEX[level] !== undefined) {
        // Use level-based index, but clamp to available matches
        matchIndex = Math.min(LEVEL_TO_INDEX[level], allHideMatches.length - 1);
      } else {
        // Fallback: last match (legacy behavior for Master or unknown level)
        matchIndex = allHideMatches.length - 1;
      }

      const selectedMatch = allHideMatches[matchIndex];
      measurements.min_hides = parseInt(selectedMatch[1]);
      if (selectedMatch[2]) {
        measurements.max_hides = parseInt(selectedMatch[2]);
      } else {
        measurements.max_hides = measurements.min_hides;
      }
      measurements.hides_known = selectedMatch[3].toLowerCase() === 'known';
    }
  }

  // Fallback: Try simple patterns if not already set
  if (measurements.min_hides === undefined) {
    // Try table format: "Hides: 1-4 (Unknown)"
    let hidesTableMatch = text.match(MEASUREMENT_PATTERNS.hides_table);
    if (hidesTableMatch) {
      measurements.min_hides = parseInt(hidesTableMatch[1]);
      if (hidesTableMatch[2]) {
        measurements.max_hides = parseInt(hidesTableMatch[2]);
      } else {
        measurements.max_hides = measurements.min_hides;
      }
      if (hidesTableMatch[3]) {
        measurements.hides_known = hidesTableMatch[3].toLowerCase() === 'known';
      }
    } else {
      // Try range pattern "1-4 hides" or "1 to 4 hides"
      const hidesRangeMatch = text.match(MEASUREMENT_PATTERNS.hides_range);
      if (hidesRangeMatch) {
        measurements.min_hides = parseInt(hidesRangeMatch[1]);
        measurements.max_hides = parseInt(hidesRangeMatch[2]);
      } else {
        // Try basic pattern (but avoid matching "36 inches")
        const hidesMatch = text.match(/(\d+)\s*hide[s]?(?!\s*(?:inches|apart))/i);
        if (hidesMatch) {
          measurements.min_hides = parseInt(hidesMatch[1]);
          measurements.max_hides = measurements.min_hides;
        }
      }
    }
  }

  // Final check for unknown status if not already set
  if (measurements.min_hides !== undefined && measurements.hides_known === undefined) {
    if (/unknown\s*number/i.test(text) || /number.*unknown/i.test(text) ||
        /\(unknown\)/i.test(text)) {
      measurements.hides_known = false;
    } else if (/\(known\)/i.test(text)) {
      measurements.hides_known = true;
    } else if (/hide/i.test(text)) {
      measurements.hides_known = true;
    }
  }

  // Height (excluding "inches apart" which is spacing, not height)
  const heightMatch = text.match(MEASUREMENT_PATTERNS.height_inches);
  if (heightMatch) {
    measurements.min_height_inches = parseInt(heightMatch[1]);
    if (heightMatch[2]) {
      measurements.max_height_inches = parseInt(heightMatch[2]);
    }
  }

  // Container spacing (e.g., "36 inches apart")
  const spacingMatch = text.match(MEASUREMENT_PATTERNS.spacing_inches);
  if (spacingMatch) {
    measurements.container_spacing_inches = parseInt(spacingMatch[1]);
  }

  // Leash length
  const leashMatch = text.match(MEASUREMENT_PATTERNS.leash_feet);
  if (leashMatch) {
    measurements.max_leash_length_feet = parseInt(leashMatch[1]);
  }

  // Number of containers
  const containersMatch = text.match(MEASUREMENT_PATTERNS.containers);
  if (containersMatch) {
    measurements.num_containers = parseInt(containersMatch[1]);
  }

  // === ENHANCED EXTRACTIONS ===

  // Scent/Odor types
  const scents: string[] = [];
  if (/\bBirch\b/i.test(text)) scents.push('Birch');
  if (/\bAnise\b/i.test(text)) scents.push('Anise');
  if (/\bClove\b/i.test(text)) scents.push('Clove');
  if (/\bCypress\b/i.test(text)) scents.push('Cypress');
  if (scents.length > 0) {
    measurements.target_odors = scents;
  }

  // Distractions - count and types
  const distractionMatch = text.match(/(\d+)\s*(?:non-food\s*)?distraction/i);
  if (distractionMatch) {
    measurements.num_distractions = parseInt(distractionMatch[1]);

    const distractionTypes: string[] = [];
    if (/non-food/i.test(text)) distractionTypes.push('non-food');
    if (/\bfood\b/i.test(text) && !/non-food/i.test(text.substring(text.indexOf('food')))) distractionTypes.push('food');
    if (/auditory/i.test(text)) distractionTypes.push('auditory');
    if (/visual/i.test(text)) distractionTypes.push('visual');
    if (/human/i.test(text)) distractionTypes.push('human');
    if (/mimic/i.test(text)) distractionTypes.push('mimic');

    if (distractionTypes.length > 0) {
      measurements.distraction_types = distractionTypes;
    }
  } else if (/no distraction/i.test(text) || /without.*distraction/i.test(text)) {
    measurements.num_distractions = 0;
  }

  // Required calls
  const requiredCalls: string[] = [];
  if (/must call.*"Alert"/i.test(text) || /handler must call "Alert"/i.test(text)) {
    requiredCalls.push('Alert');
  }
  if (/must call.*"Finish"/i.test(text) || /handler must call "Finish"/i.test(text)) {
    requiredCalls.push('Finish');
  }
  if (requiredCalls.length > 0) {
    measurements.required_calls = requiredCalls;
  }

  // Container arrangement patterns
  const rowsMatch = text.match(/(\d+)\s*rows?\s*of\s*(\d+)/i);
  if (rowsMatch) {
    measurements.container_arrangement = `${rowsMatch[1]} rows of ${rowsMatch[2]}`;
  }
  if (/circle/i.test(text) && /formation/i.test(text)) {
    const current = measurements.container_arrangement || '';
    measurements.container_arrangement = current ? `${current}, circle, or U-formation` : 'circle or U-formation';
  } else if (/[""]U[""] formation/i.test(text)) {
    const current = measurements.container_arrangement || '';
    measurements.container_arrangement = current ? `${current} or U-formation` : 'U-formation';
  }

  // Distance between containers
  const distanceMatch = text.match(/(\d+)[""]?\s*apart/i);
  if (distanceMatch) {
    measurements.min_spacing_inches = parseInt(distanceMatch[1]);
  }

  // Container type
  if (/identical.*cardboard.*box/i.test(text)) {
    measurements.container_type = 'Identical cardboard boxes';
  } else if (/various.*size.*type/i.test(text)) {
    measurements.container_type = 'Various size and type';
  }

  return Object.keys(measurements).length > 0 ? measurements : {};
}

/**
 * Generate keywords from text
 */
function generateKeywords(text: string, level: string | null, element: string | null): string[] {
  const keywords: Set<string> = new Set();

  // Add level and element
  if (level) keywords.add(level.toLowerCase());
  if (element) keywords.add(element.toLowerCase());

  // Common keywords to extract
  const commonTerms = [
    'area', 'size', 'time', 'limit', 'hide', 'hides', 'search', 'handler',
    'dog', 'leash', 'judge', 'warning', 'terrain', 'container', 'interior',
    'exterior', 'buried', 'elimination', 'fault', 'requirement', 'minimum',
    'maximum', 'distraction', 'inaccessible', 'accessible', 'qualification',
    'qualifying', 'score', 'points'
  ];

  const lowerText = text.toLowerCase();
  commonTerms.forEach(term => {
    if (lowerText.includes(term)) {
      keywords.add(term);
    }
  });

  return Array.from(keywords);
}

/**
 * Determine category based on content
 */
function determineCategory(text: string): string {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('area') || lowerText.includes('size')) {
    return 'Search Area';
  } else if (lowerText.includes('time') || lowerText.includes('limit')) {
    return 'Time Limit';
  } else if (lowerText.includes('hide')) {
    return 'Hides';
  } else if (lowerText.includes('leash') || lowerText.includes('equipment')) {
    return 'Equipment';
  } else if (lowerText.includes('handler') || lowerText.includes('conduct')) {
    return 'Handler Requirements';
  } else if (lowerText.includes('judge') || lowerText.includes('score')) {
    return 'Judging';
  } else if (lowerText.includes('fault') || lowerText.includes('elimination')) {
    return 'Faults and Eliminations';
  }

  return 'General';
}

/**
 * Extract all sections from a chapter automatically
 */
function extractAllSections(chapterText: string, chapterNum: number): ParsedRule[] {
  const rules: ParsedRule[] = [];

  // Find all section headers in this chapter
  // Pattern: "Section 1. Title" or "Section 1   Title"
  const sectionMatches = chapterText.matchAll(/Section\s+(\d+)[.\s]+([^\n]+?)(?=\s{2,}|\.(?:\s|$))/g);
  const sections = Array.from(sectionMatches);

  console.log(`   Found ${sections.length} sections in Chapter ${chapterNum}`);

  // Extract content for each section
  for (let i = 0; i < sections.length; i++) {
    const match = sections[i];
    const sectionNum = match[1];
    const title = match[2].trim();
    const sectionStartIdx = match.index!;

    // Find where this section ends (start of next section or end of chapter)
    let sectionEndIdx: number;
    if (i < sections.length - 1) {
      sectionEndIdx = sections[i + 1].index!;
    } else {
      sectionEndIdx = chapterText.length;
    }

    // Extract content between section header and next section
    const sectionContent = chapterText.substring(sectionStartIdx, sectionEndIdx);

    // Remove the section header line to get just content
    const contentMatch = sectionContent.match(/Section\s+\d+[.\s]+[^\n]+?[.:]\s*(.*?)$/s);
    const content = contentMatch ? contentMatch[1].trim() : sectionContent.trim();

    // Skip if content is too short (likely parsing error)
    if (content.length < 10) {
      continue;
    }

    // Extract metadata
    const level = extractLevel(title + ' ' + content);
    const element = extractElement(title + ' ' + content);
    const measurements = extractMeasurements(content, level);
    const keywords = generateKeywords(content, level, element);
    const category = determineCategory(content);

    rules.push({
      section: `Chapter ${chapterNum}, Section ${sectionNum}`,
      title,
      content,
      level,
      element,
      category,
      keywords,
      measurements,
    });

    console.log(`   ✓ Section ${sectionNum}: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`);
  }

  return rules;
}

/**
 * Parse the PDF and extract ALL rules from ALL chapters
 */
async function parsePDF(): Promise<ParsedRule[]> {
  console.log(`📄 Reading PDF: ${PDF_PATH}`);

  // Read the PDF file
  const dataBuffer = new Uint8Array(fs.readFileSync(PDF_PATH));

  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
  const pdfDocument = await loadingTask.promise;

  console.log(`📊 PDF Stats:`);
  console.log(`   - Pages: ${pdfDocument.numPages}`);

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

  console.log(`   - Text length: ${fullText.length} characters`);
  console.log('\n🔍 Automatically extracting ALL sections from ALL chapters...\n');

  const rules: ParsedRule[] = [];

  // Find all chapters (CHAPTER 1, CHAPTER 2, etc.)
  const chapterMatches = fullText.matchAll(/CHAPTER\s+(\d+)/g);
  const chapters = Array.from(chapterMatches);

  console.log(`📚 Found ${chapters.length} chapters\n`);

  // Extract rules from each chapter
  for (let i = 0; i < chapters.length; i++) {
    const chapterMatch = chapters[i];
    const chapterNum = parseInt(chapterMatch[1]);
    const chapterStartIdx = chapterMatch.index!;

    // Find where this chapter ends (start of next chapter or end of document)
    let chapterEndIdx: number;
    if (i < chapters.length - 1) {
      chapterEndIdx = chapters[i + 1].index!;
    } else {
      chapterEndIdx = fullText.length;
    }

    // Extract chapter text
    let chapterText = fullText.substring(chapterStartIdx, chapterEndIdx);

    // Remove page headers (e.g., "CHAPTER 5 31")
    chapterText = chapterText.replace(new RegExp(`CHAPTER\\s+${chapterNum}\\s+\\d+`, 'g'), '');

    console.log(`\n📖 Chapter ${chapterNum}:`);

    // Extract all sections from this chapter
    const chapterRules = extractAllSections(chapterText, chapterNum);
    rules.push(...chapterRules);

    // Special handling for Chapter 7 - extract element/level class requirements
    if (chapterNum === 7) {
      const elements = ['Container', 'Interior', 'Exterior', 'Buried'];
      const levels = ['Novice', 'Advanced', 'Excellent', 'Master'];

      console.log('   Extracting element/level class requirements...');

      elements.forEach((element, elemIdx) => {
        levels.forEach(level => {
          // Build lookahead that only matches actual section headers after sentence endings
          const nextSectionPatterns = [];
          for (const el of elements) {
            for (const lv of levels) {
              nextSectionPatterns.push(`\\s\\s+${el}\\s+${lv}\\s+Class\\s*:`);
            }
          }
          const nextSectionPattern = nextSectionPatterns.join('|');

          const pattern = new RegExp(`${element}\\s+${level}\\s+Class\\s*:(.*?)(?=${nextSectionPattern}|Section\\s+\\d+\\.|$)`, 's');
          const match = chapterText.match(pattern);

          if (match) {
            const content = match[1].trim();

            // Skip if too short or already extracted
            if (content.length < 50) {
              return;
            }

            const section = `Chapter 7, Section ${elemIdx + 4}`;
            const title = `${element} ${level} Requirements`;
            const measurements = extractMeasurements(content, level);
            const keywords = generateKeywords(content, level, element);
            const category = determineCategory(content);

            rules.push({
              section,
              title,
              content,
              level,
              element,
              category,
              keywords,
              measurements,
            });

            console.log(`   ✓ ${title}`);
          }
        });
      });
    }
  }

  console.log(`\n✅ Extracted ${rules.length} rules from PDF`);

  return rules;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 AKC Scent Work Rulebook Parser\n');

    // Check if PDF exists
    if (!fs.existsSync(PDF_PATH)) {
      console.error(`❌ PDF file not found: ${PDF_PATH}`);
      process.exit(1);
    }

    const rules = await parsePDF();

    console.log(`\n✅ Parsing complete!`);
    console.log(`   - Extracted ${rules.length} rules`);

    // Load and merge authoritative measurements
    const authDataPath = path.join(__dirname, '../data/authoritative-measurements.json');
    if (fs.existsSync(authDataPath)) {
      console.log('\n📊 Merging authoritative measurements...');
      const authData = JSON.parse(fs.readFileSync(authDataPath, 'utf8'));
      const scentWorkData = authData.sports?.['akc-scent-work']?.elements;

      if (scentWorkData) {
        let mergeCount = 0;
        rules.forEach((rule) => {
          // Match rules by element and level
          const element = rule.element;
          const level = rule.level;

          if (element && level && scentWorkData[element]?.[level]) {
            const authMeasurements = scentWorkData[element][level];
            // Merge authoritative measurements into rule (authoritative wins)
            rule.measurements = {
              ...rule.measurements,
              ...authMeasurements,
            };
            rule.measurementsSource = 'authoritative';
            mergeCount++;
          }
        });
        console.log(`   - Merged authoritative data for ${mergeCount} rules`);
      }
    } else {
      console.log('\n⚠️  No authoritative measurements file found, using parsed data only');
    }

    // Save to JSON file for review
    const outputPath = path.join(__dirname, '../data/parsed-rules.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));

    console.log(`   - Saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error parsing PDF:', error);
    process.exit(1);
  }
}

// Run main function
main();

export { parsePDF, ParsedRule };
