#!/usr/bin/env node

/**
 * Integration Test Runner
 * Validates all Zustand store integration tests
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
  'allStores.integration.test.ts',
  'dogStore.integration.test.ts', 
  'userStore.integration.test.ts',
  'showStore.integration.test.ts',
  'classStoreIntegration.test.ts' // Existing test
];

const testDir = path.join(__dirname);

console.log('🧪 Running Zustand Store Integration Tests');
console.log('=' .repeat(50));

function runTest(testFile) {
  const testPath = path.join(testDir, testFile);
  
  if (!fs.existsSync(testPath)) {
    console.log(`❌ Test file not found: ${testFile}`);
    return false;
  }

  try {
    console.log(`\n🔄 Running: ${testFile}`);
    
    const result = execSync(
      `npm run test -- --run --reporter=verbose "${testPath}"`,
      { 
        cwd: path.join(__dirname, '../../..'),
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    
    console.log(`✅ PASSED: ${testFile}`);
    
    // Extract test summary from output
    const lines = result.split('\n');
    const summaryLine = lines.find(line => 
      line.includes('passed') || line.includes('failed')
    );
    
    if (summaryLine) {
      console.log(`   ${summaryLine.trim()}`);
    }
    
    return true;
    
  } catch (error) {
    console.log(`❌ FAILED: ${testFile}`);
    console.log(`   Error: ${error.message}`);
    
    if (error.stdout) {
      const errorLines = error.stdout.split('\n')
        .filter(line => line.includes('FAIL') || line.includes('Error'))
        .slice(0, 3);
      
      errorLines.forEach(line => {
        console.log(`   ${line.trim()}`);
      });
    }
    
    return false;
  }
}

async function runAllTests() {
  let passed = 0;
  let failed = 0;
  
  console.log(`Found ${testFiles.length} test files to run\n`);
  
  for (const testFile of testFiles) {
    const success = runTest(testFile);
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📁 Total:  ${testFiles.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All integration tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

// Validate test environment
function validateEnvironment() {
  const packageJsonPath = path.join(__dirname, '../../../package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.error('❌ Could not find package.json. Make sure you are in the project root.');
    process.exit(1);
  }
  
  try {
    execSync('npm --version', { stdio: 'pipe' });
  } catch (error) {
    console.error('❌ npm is not available. Make sure Node.js and npm are installed.');
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
}

// Main execution
if (require.main === module) {
  validateEnvironment();
  runAllTests().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { runTest, runAllTests };