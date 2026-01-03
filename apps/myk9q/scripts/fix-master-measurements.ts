import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Fix Master level measurements based on AKC Scent Work PDF tables
 * These are manually extracted from the comparison tables in the PDF
 */

const MASTER_MEASUREMENTS = {
  'Container': {
    min_hides: 1,
    max_hides: 4,
    hides_known: false,
  },
  'Interior': {
    min_hides: 0,
    max_hides: 6,  // 0-3 per area, 2-6 per class
    hides_known: false,
  },
  'Exterior': {
    min_hides: 0,
    max_hides: 6,  // 0-3 per area, 2-6 per class
    hides_known: false,
  },
  'Buried': {
    min_hides: 1,
    max_hides: 4,
    hides_known: false,
  },
};

async function fixMasterMeasurements() {
  const inputPath = path.join(__dirname, '../data/parsed-rules.json');
  const outputPath = inputPath; // Overwrite the same file

  console.log('📚 Reading parsed rules...');
  const rules = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  let updatedCount = 0;

  rules.forEach((rule: any) => {
    if (rule.level === 'Master' && rule.element && MASTER_MEASUREMENTS[rule.element as keyof typeof MASTER_MEASUREMENTS]) {
      const correctMeasurements = MASTER_MEASUREMENTS[rule.element as keyof typeof MASTER_MEASUREMENTS];

      console.log(`\n✏️  Updating ${rule.element} Master`);
      console.log(`   Before: min_hides=${rule.measurements.min_hides}, max_hides=${rule.measurements.max_hides}, hides_known=${rule.measurements.hides_known}`);

      // Add the correct hide measurements
      rule.measurements.min_hides = correctMeasurements.min_hides;
      rule.measurements.max_hides = correctMeasurements.max_hides;
      rule.measurements.hides_known = correctMeasurements.hides_known;

      console.log(`   After:  min_hides=${rule.measurements.min_hides}, max_hides=${rule.measurements.max_hides}, hides_known=${rule.measurements.hides_known}`);

      updatedCount++;
    }
  });

  console.log(`\n💾 Saving updated rules...`);
  fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));

  console.log(`\n✅ Updated ${updatedCount} Master level rules`);
  console.log(`   Saved to: ${outputPath}`);
}

fixMasterMeasurements().catch(console.error);
