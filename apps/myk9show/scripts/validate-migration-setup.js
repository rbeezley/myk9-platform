#!/usr/bin/env node

/**
 * Validation script to check if migration setup is correct
 * This script validates the migration files and preparation
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🔍 Validating migration setup...\n');

// Check if migration files exist
const migrationFiles = [
  'supabase/migrations/20250126_singular_table_names.sql',
  'supabase/migrations/rollback_20250126_singular_table_names.sql'
];

const scriptFiles = [
  'scripts/migrate-to-singular-tables.ts',
  'scripts/document-current-state.ts'
];

const documentationFiles = [
  'docs/database-naming-refactor-plan.md',
  'docs/migration-execution-guide.md'
];

let allValid = true;

// Check migration files
console.log('📂 Checking migration files:');
migrationFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`  ✅ ${file} (${Math.round(size/1024)}KB)`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allValid = false;
  }
});

// Check script files
console.log('\n🔧 Checking migration scripts:');
scriptFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`  ✅ ${file} (${Math.round(size/1024)}KB)`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allValid = false;
  }
});

// Check documentation files
console.log('\n📚 Checking documentation:');
documentationFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`  ✅ ${file} (${Math.round(size/1024)}KB)`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allValid = false;
  }
});

// Check package.json for migration scripts
console.log('\n📦 Checking package.json scripts:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredScripts = [
    'migration:document',
    'migration:migrate-code',
    'migration:full'
  ];

  requiredScripts.forEach(script => {
    if (packageJson.scripts && packageJson.scripts[script]) {
      console.log(`  ✅ ${script}: ${packageJson.scripts[script]}`);
    } else {
      console.log(`  ❌ ${script} - MISSING`);
      allValid = false;
    }
  });
} catch (error) {
  console.log('  ❌ Error reading package.json:', error.message);
  allValid = false;
}

// Check git branch
console.log('\n🌿 Checking git branch:');
try {
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  if (branch === 'refactor/singular-table-names') {
    console.log(`  ✅ On correct branch: ${branch}`);
  } else {
    console.log(`  ⚠️ On branch: ${branch} (expected: refactor/singular-table-names)`);
  }
} catch (error) {
  console.log('  ❌ Error checking git branch:', error.message);
}

// Check SQL file content for critical operations
console.log('\n🔍 Validating SQL migration content:');
try {
  const migrationContent = fs.readFileSync('supabase/migrations/20250126_singular_table_names.sql', 'utf8');
  
  const criticalOperations = [
    'people RENAME TO "user"',
    'dogs RENAME TO dog',
    'shows RENAME TO show',
    'show_trials RENAME TO trial',
    'BEGIN;',
    'COMMIT;'
  ];

  criticalOperations.forEach(operation => {
    if (migrationContent.includes(operation)) {
      console.log(`  ✅ Contains: ${operation}`);
    } else {
      console.log(`  ❌ Missing: ${operation}`);
      allValid = false;
    }
  });
} catch (error) {
  console.log('  ❌ Error reading migration file:', error.message);
  allValid = false;
}

// Final validation
console.log('\n📊 Migration Setup Summary:');
if (allValid) {
  console.log('✅ All migration files and scripts are present and valid!');
  console.log('\n🚀 Ready to execute migration. Next steps:');
  console.log('1. Review the migration plan: docs/database-naming-refactor-plan.md');
  console.log('2. Follow execution guide: docs/migration-execution-guide.md');
  console.log('3. Test on local Supabase instance first');
  console.log('4. Create database backup before production migration');
} else {
  console.log('❌ Migration setup has issues that need to be resolved.');
  console.log('Please check the missing files and fix any issues before proceeding.');
}

console.log('\n📋 Table Rename Summary:');
const tableRenames = [
  'people → user',
  'dogs → dog', 
  'shows → show',
  'clubs → club',
  'show_trials → trial',
  'classes → class',
  'entries → entry',
  'results → result',
  '+ 39 more tables'
];

tableRenames.forEach(rename => {
  console.log(`  • ${rename}`);
});

console.log('\n⚠️ REMINDER: This is a high-risk migration affecting all database tables.');
console.log('Always test on a staging environment first!');