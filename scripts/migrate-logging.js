const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get list of files with console statements using Windows-compatible path
function getFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '__tests__' && item.name !== 'examples') {
        files.push(...getFiles(fullPath));
      }
    } else if ((item.name.endsWith('.ts') || item.name.endsWith('.tsx')) &&
               !item.name.includes('.test.') &&
               !item.name.includes('.spec.') &&
               item.name !== 'LoggingService.ts') {
      files.push(fullPath);
    }
  }

  return files;
}

// Process a single file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Check if file has console statements
  const hasConsole = content.includes('console.log') ||
                     content.includes('console.warn') ||
                     content.includes('console.error');

  if (!hasConsole) {
    return { status: 'skipped', reason: 'no console statements' };
  }

  // Add import if not present
  const hasImport = content.includes("import { logger } from '@/services/LoggingService'");
  if (!hasImport) {
    // Find a good place to add the import after the first block of imports
    const lines = content.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.match(/^import\s*\{/)) {
        lastImportIndex = i;
      } else if (lastImportIndex >= 0 && !line.startsWith('import') && !line.startsWith('}') && !line.startsWith('*') && line !== '' && !line.startsWith('//')) {
        // Check if this looks like continuing from a previous import
        if (!lines[lastImportIndex].includes(';') && line.includes('from ')) {
          lastImportIndex = i;
          continue;
        }
        break;
      }
    }

    if (lastImportIndex >= 0) {
      // Insert after the last import
      lines.splice(lastImportIndex + 1, 0, "import { logger } from '@/services/LoggingService';");
      content = lines.join('\n');
    } else {
      // Add at the beginning
      content = "import { logger } from '@/services/LoggingService';\n\n" + content;
    }
  }

  // Get category from file path
  let category = 'app';
  const normPath = filePath.replace(/\\/g, '/');
  if (normPath.includes('/services/sync/')) category = 'sync';
  else if (normPath.includes('/services/database/')) category = 'database';
  else if (normPath.includes('/services/performance/')) category = 'performance';
  else if (normPath.includes('/services/rbac/')) category = 'rbac';
  else if (normPath.includes('/services/scoring/')) category = 'scoring';
  else if (normPath.includes('/services/realtime/')) category = 'realtime';
  else if (normPath.includes('/services/offline/')) category = 'offline';
  else if (normPath.includes('/services/analytics/')) category = 'analytics';
  else if (normPath.includes('/services/entries/')) category = 'entries';
  else if (normPath.includes('/services/deployment/')) category = 'deployment';
  else if (normPath.includes('/services/notifications/')) category = 'notifications';
  else if (normPath.includes('/services/collaboration/')) category = 'collaboration';
  else if (normPath.includes('/services/')) category = 'services';
  else if (normPath.includes('/hooks/')) category = 'hooks';
  else if (normPath.includes('/components/admin/')) category = 'admin';
  else if (normPath.includes('/components/scoring/')) category = 'scoring';
  else if (normPath.includes('/components/shows/')) category = 'shows';
  else if (normPath.includes('/components/secretary/')) category = 'secretary';
  else if (normPath.includes('/components/sync/')) category = 'sync';
  else if (normPath.includes('/components/alerts/')) category = 'alerts';
  else if (normPath.includes('/components/analytics/')) category = 'analytics';
  else if (normPath.includes('/components/dogs/')) category = 'dogs';
  else if (normPath.includes('/components/entries/')) category = 'entries';
  else if (normPath.includes('/components/classes/')) category = 'classes';
  else if (normPath.includes('/components/clubs/')) category = 'clubs';
  else if (normPath.includes('/components/competition/')) category = 'competition';
  else if (normPath.includes('/components/')) category = 'components';
  else if (normPath.includes('/pages/')) category = 'pages';
  else if (normPath.includes('/utils/')) category = 'utils';
  else if (normPath.includes('/store/')) category = 'store';
  else if (normPath.includes('/lib/')) category = 'lib';
  else if (normPath.includes('/providers/')) category = 'provider';
  else if (normPath.includes('/contexts/')) category = 'context';

  // Replace console statements with logger equivalents
  // Simple string logs
  content = content.replace(/console\.log\((['"`][^'"`\n]+['"`])\);/g, `logger.debug($1, '${category}', {});`);
  content = content.replace(/console\.warn\((['"`][^'"`\n]+['"`])\);/g, `logger.warn($1, '${category}', {});`);
  content = content.replace(/console\.error\((['"`][^'"`\n]+['"`])\);/g, `logger.error($1, '${category}', {});`);

  // String with error object
  content = content.replace(/console\.error\((['"`][^'"`\n]+['"`]),\s*(\w+)\);/g, `logger.error($1, '${category}', {}, $2 as Error);`);

  // String with variable interpolation/concatenation
  content = content.replace(/console\.log\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, `logger.debug($1, '${category}', {});`);
  content = content.replace(/console\.warn\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, `logger.warn($1, '${category}', {});`);
  content = content.replace(/console\.error\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, `logger.error($1, '${category}', {});`);

  // Template literals
  content = content.replace(/console\.log\((`[^`]+`)\);/g, `logger.debug($1, '${category}', {});`);
  content = content.replace(/console\.warn\((`[^`]+`)\);/g, `logger.warn($1, '${category}', {});`);
  content = content.replace(/console\.error\((`[^`]+`)\);/g, `logger.error($1, '${category}', {});`);

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { status: 'processed' };
  }

  return { status: 'unchanged', reason: 'complex console statement' };
}

// Main
const srcDir = path.join(__dirname, '..', 'apps', 'myk9show', 'src');
console.log('Scanning:', srcDir);

const allFiles = getFiles(srcDir);
console.log(`Found ${allFiles.length} TypeScript files`);

// Filter to files with console statements
const filesToProcess = allFiles.filter(f => {
  const content = fs.readFileSync(f, 'utf8');
  return content.includes('console.log') || content.includes('console.warn') || content.includes('console.error');
});

console.log(`Found ${filesToProcess.length} files with console statements\n`);

let processed = 0;
let unchanged = 0;
let errors = [];

filesToProcess.forEach(file => {
  try {
    const result = processFile(file);
    if (result.status === 'processed') {
      processed++;
      console.log(`✓ ${path.relative(srcDir, file)}`);
    } else {
      unchanged++;
    }
  } catch (e) {
    errors.push({ file: path.relative(srcDir, file), error: e.message });
    console.log(`✗ ${path.relative(srcDir, file)}: ${e.message}`);
  }
});

console.log('\n=== Summary ===');
console.log(`Processed: ${processed}`);
console.log(`Unchanged (complex patterns): ${unchanged}`);
console.log(`Errors: ${errors.length}`);

if (unchanged > 0) {
  console.log('\nFiles with complex patterns need manual review');
}
