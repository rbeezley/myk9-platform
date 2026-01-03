import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestCase {
  id: string;
  category: string;
  query: string;
  expectedAnswer: {
    min_hides?: number;
    max_hides?: number;
    hides_known?: boolean;
    min_area_sq_ft?: number;
    max_area_sq_ft?: number;
    time_limit_minutes?: number;
    num_containers?: number;
    keywords: string[];
  };
  notes?: string;
}

interface TestResult {
  testId: string;
  query: string;
  passed: boolean;
  actualAnswer: string;
  expectedKeywords: string[];
  foundKeywords: string[];
  missingKeywords: string[];
  errors: string[];
  notes?: string;
}

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Query the Rules Assistant Edge Function
 */
async function queryRulesAssistant(query: string): Promise<{ answer: string; rules: any[] }> {
  const { data, error } = await supabase.functions.invoke('search-rules-v2', {
    body: {
      query,
      limit: 5,
      organizationCode: 'AKC',
      sportCode: 'scent-work',
    },
  });

  if (error) {
    throw new Error(`Edge Function error: ${error.message}`);
  }

  return {
    answer: data.answer,
    rules: data.results,
  };
}

/**
 * Validate answer against expected values
 */
function validateAnswer(
  testCase: TestCase,
  actualAnswer: string,
  rules: any[]
): { passed: boolean; errors: string[]; foundKeywords: string[]; missingKeywords: string[] } {
  const errors: string[] = [];
  const answerLower = actualAnswer.toLowerCase();
  const foundKeywords: string[] = [];
  const missingKeywords: string[] = [];

  // Check for required keywords in the answer
  for (const keyword of testCase.expectedAnswer.keywords) {
    if (answerLower.includes(keyword.toLowerCase())) {
      foundKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  }

  // Must find at least 60% of keywords
  const keywordMatchRate = foundKeywords.length / testCase.expectedAnswer.keywords.length;
  if (keywordMatchRate < 0.6) {
    errors.push(
      `Keyword match rate too low: ${(keywordMatchRate * 100).toFixed(0)}% (expected ≥60%)`
    );
  }

  // Validate measurements in the first rule's measurements field
  if (rules.length > 0) {
    const measurements = rules[0].measurements || {};

    // Check min_hides
    if (testCase.expectedAnswer.min_hides !== undefined) {
      if (measurements.min_hides !== testCase.expectedAnswer.min_hides) {
        errors.push(
          `Min hides mismatch: expected ${testCase.expectedAnswer.min_hides}, got ${measurements.min_hides}`
        );
      }
    }

    // Check max_hides
    if (testCase.expectedAnswer.max_hides !== undefined) {
      if (measurements.max_hides !== testCase.expectedAnswer.max_hides) {
        errors.push(
          `Max hides mismatch: expected ${testCase.expectedAnswer.max_hides}, got ${measurements.max_hides}`
        );
      }
    }

    // Check hides_known
    if (testCase.expectedAnswer.hides_known !== undefined) {
      if (measurements.hides_known !== testCase.expectedAnswer.hides_known) {
        errors.push(
          `Hides known mismatch: expected ${testCase.expectedAnswer.hides_known}, got ${measurements.hides_known}`
        );
      }
    }

    // Check area
    if (testCase.expectedAnswer.min_area_sq_ft !== undefined) {
      if (measurements.min_area_sq_ft !== testCase.expectedAnswer.min_area_sq_ft) {
        errors.push(
          `Min area mismatch: expected ${testCase.expectedAnswer.min_area_sq_ft}, got ${measurements.min_area_sq_ft}`
        );
      }
    }

    if (testCase.expectedAnswer.max_area_sq_ft !== undefined) {
      if (measurements.max_area_sq_ft !== testCase.expectedAnswer.max_area_sq_ft) {
        errors.push(
          `Max area mismatch: expected ${testCase.expectedAnswer.max_area_sq_ft}, got ${measurements.max_area_sq_ft}`
        );
      }
    }

    // Check time limit
    if (testCase.expectedAnswer.time_limit_minutes !== undefined) {
      if (measurements.time_limit_minutes !== testCase.expectedAnswer.time_limit_minutes) {
        errors.push(
          `Time limit mismatch: expected ${testCase.expectedAnswer.time_limit_minutes}, got ${measurements.time_limit_minutes}`
        );
      }
    }

    // Check containers
    if (testCase.expectedAnswer.num_containers !== undefined) {
      if (measurements.num_containers !== testCase.expectedAnswer.num_containers) {
        errors.push(
          `Container count mismatch: expected ${testCase.expectedAnswer.num_containers}, got ${measurements.num_containers}`
        );
      }
    }
  } else {
    errors.push('No rules returned from search');
  }

  return {
    passed: errors.length === 0,
    errors,
    foundKeywords,
    missingKeywords,
  };
}

/**
 * Run all validation tests
 */
async function runValidationTests(): Promise<void> {
  console.log('🧪 AKC Scent Work Rules Validation Test Suite\n');
  console.log('=' .repeat(80));

  // Load test cases
  const testFilePath = path.join(__dirname, '../tests/rules-validation-tests.json');
  const testCases: TestCase[] = JSON.parse(fs.readFileSync(testFilePath, 'utf-8'));

  console.log(`\n📋 Loaded ${testCases.length} test cases\n`);

  const results: TestResult[] = [];
  let passCount = 0;
  let failCount = 0;

  // Run tests sequentially to avoid rate limits
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    process.stdout.write(`\n[${i + 1}/${testCases.length}] Testing: "${testCase.query}"...`);

    try {
      // Query the assistant
      const { answer, rules } = await queryRulesAssistant(testCase.query);

      // Validate the answer
      const validation = validateAnswer(testCase, answer, rules);

      const result: TestResult = {
        testId: testCase.id,
        query: testCase.query,
        passed: validation.passed,
        actualAnswer: answer,
        expectedKeywords: testCase.expectedAnswer.keywords,
        foundKeywords: validation.foundKeywords,
        missingKeywords: validation.missingKeywords,
        errors: validation.errors,
        notes: testCase.notes,
      };

      results.push(result);

      if (validation.passed) {
        console.log(` ✅ PASS`);
        passCount++;
      } else {
        console.log(` ❌ FAIL`);
        failCount++;
        console.log(`   Errors:`);
        validation.errors.forEach((err) => console.log(`   - ${err}`));
        if (validation.missingKeywords.length > 0) {
          console.log(`   Missing keywords: ${validation.missingKeywords.join(', ')}`);
        }
        console.log(`   Actual answer: "${answer}"`);
      }

      // Delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(` ❌ ERROR`);
      console.error(`   ${error}`);
      failCount++;

      results.push({
        testId: testCase.id,
        query: testCase.query,
        passed: false,
        actualAnswer: '',
        expectedKeywords: testCase.expectedAnswer.keywords,
        foundKeywords: [],
        missingKeywords: testCase.expectedAnswer.keywords,
        errors: [String(error)],
        notes: testCase.notes,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Test Summary\n');
  console.log(`   Total Tests:  ${testCases.length}`);
  console.log(`   ✅ Passed:    ${passCount} (${((passCount / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Failed:    ${failCount} (${((failCount / testCases.length) * 100).toFixed(1)}%)`);

  // Category breakdown
  const categoryStats: Record<string, { pass: number; fail: number }> = {};
  results.forEach((result) => {
    const testCase = testCases.find((tc) => tc.id === result.testId)!;
    if (!categoryStats[testCase.category]) {
      categoryStats[testCase.category] = { pass: 0, fail: 0 };
    }
    if (result.passed) {
      categoryStats[testCase.category].pass++;
    } else {
      categoryStats[testCase.category].fail++;
    }
  });

  console.log('\n📂 Category Breakdown:\n');
  Object.entries(categoryStats).forEach(([category, stats]) => {
    const total = stats.pass + stats.fail;
    const passRate = (stats.pass / total) * 100;
    console.log(
      `   ${category.padEnd(20)} ${stats.pass}/${total} (${passRate.toFixed(0)}%)`
    );
  });

  // Save detailed results
  const resultsPath = path.join(__dirname, '../tests/validation-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Detailed results saved to: ${resultsPath}`);

  // Exit with error if any tests failed
  if (failCount > 0) {
    console.log('\n⚠️  Some tests failed. Review the errors above.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Rules Assistant is accurate.\n');
    process.exit(0);
  }
}

// Run tests
runValidationTests().catch((error) => {
  console.error('\n❌ Fatal error running tests:', error);
  process.exit(1);
});
