import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// List of critical files to check individually
const criticalFiles = [
  'src/App.tsx',
  'src/hooks/queries/useUsersQuery.ts',
  'src/store/userStore.ts',
  'src/components/subscription/SubscriptionManager.tsx',
  'src/components/admin/users/BulkActionsBar.tsx',
  'src/test/setup.ts'
];

console.log('Checking critical files for TypeScript errors...\n');

let totalErrors = 0;

for (const file of criticalFiles) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${file} - File not found`);
    continue;
  }
  
  try {
    console.log(`Checking ${file}...`);
    execSync(`npx tsc --noEmit --skipLibCheck --project tsconfig.app.json ${file}`, { 
      stdio: 'pipe',
      timeout: 15000 
    });
    console.log(`✅ ${file} - No errors`);
  } catch (error) {
    const output = error.stdout?.toString() || error.stderr?.toString() || '';
    if (output.includes('error TS')) {
      const errorCount = (output.match(/error TS/g) || []).length;
      totalErrors += errorCount;
      console.log(`❌ ${file} - ${errorCount} errors`);
      // Show first few lines of errors
      const lines = output.split('\n').filter(line => line.includes('error TS')).slice(0, 3);
      lines.forEach(line => console.log(`   ${line}`));
      if (errorCount > 3) {
        console.log(`   ... and ${errorCount - 3} more errors`);
      }
    } else {
      console.log(`✅ ${file} - No TS errors (other issue)`);
    }
    console.log();
  }
}

console.log(`\nTotal TypeScript errors found: ${totalErrors}`);