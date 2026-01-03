import { execSync } from 'child_process';

console.log('Getting TypeScript errors...\n');

try {
  // Run TypeScript check with timeout
  const result = execSync('npx tsc --noEmit --skipLibCheck', { 
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  });
  console.log('✅ No TypeScript errors found!');
} catch (error) {
  if (error.stdout) {
    const lines = error.stdout.split('\n').filter(line => line.trim());
    const errorLines = lines.filter(line => line.includes('error TS'));
    
    console.log(`Found ${errorLines.length} TypeScript errors:\n`);
    
    // Group errors by file
    const errorsByFile = {};
    errorLines.forEach(line => {
      const match = line.match(/^(.+?)\(\d+,\d+\): error/);
      if (match) {
        const file = match[1];
        if (!errorsByFile[file]) {
          errorsByFile[file] = [];
        }
        errorsByFile[file].push(line);
      }
    });
    
    // Show first few files with errors
    let count = 0;
    for (const [file, errors] of Object.entries(errorsByFile)) {
      if (count >= 5) break; // Limit to first 5 files
      console.log(`\n📁 ${file} (${errors.length} errors):`);
      errors.slice(0, 3).forEach(error => {
        console.log(`   ${error}`);
      });
      if (errors.length > 3) {
        console.log(`   ... and ${errors.length - 3} more errors`);
      }
      count++;
    }
    
    console.log(`\nTotal files with errors: ${Object.keys(errorsByFile).length}`);
    console.log(`Total error count: ${errorLines.length}`);
  } else {
    console.log('❌ TypeScript check failed:', error.message);
  }
}