const fs = require('fs');
const path = require('path');

// Get list of files recursively
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

// Get category from file path
function getCategory(filePath) {
  const normPath = filePath.replace(/\\/g, '/');
  if (normPath.includes('/services/sync/')) return 'sync';
  if (normPath.includes('/services/database/')) return 'database';
  if (normPath.includes('/services/performance/')) return 'performance';
  if (normPath.includes('/services/rbac/')) return 'rbac';
  if (normPath.includes('/services/scoring/')) return 'scoring';
  if (normPath.includes('/services/realtime/')) return 'realtime';
  if (normPath.includes('/services/offline/')) return 'offline';
  if (normPath.includes('/services/analytics/')) return 'analytics';
  if (normPath.includes('/services/entries/')) return 'entries';
  if (normPath.includes('/services/deployment/')) return 'deployment';
  if (normPath.includes('/services/notifications/')) return 'notifications';
  if (normPath.includes('/services/collaboration/')) return 'collaboration';
  if (normPath.includes('/services/monitoring/')) return 'monitoring';
  if (normPath.includes('/services/compression/')) return 'compression';
  if (normPath.includes('/services/templates/')) return 'templates';
  if (normPath.includes('/services/testing/')) return 'testing';
  if (normPath.includes('/services/error/')) return 'error';
  if (normPath.includes('/services/optimistic/')) return 'optimistic';
  if (normPath.includes('/services/mappers/')) return 'mappers';
  if (normPath.includes('/services/')) return 'services';
  if (normPath.includes('/hooks/')) return 'hooks';
  if (normPath.includes('/components/admin/')) return 'admin';
  if (normPath.includes('/components/scoring/')) return 'scoring';
  if (normPath.includes('/components/shows/')) return 'shows';
  if (normPath.includes('/components/secretary/')) return 'secretary';
  if (normPath.includes('/components/sync/')) return 'sync';
  if (normPath.includes('/components/alerts/')) return 'alerts';
  if (normPath.includes('/components/analytics/')) return 'analytics';
  if (normPath.includes('/components/dogs/')) return 'dogs';
  if (normPath.includes('/components/entries/')) return 'entries';
  if (normPath.includes('/components/classes/')) return 'classes';
  if (normPath.includes('/components/clubs/')) return 'clubs';
  if (normPath.includes('/components/competition/')) return 'competition';
  if (normPath.includes('/components/debug/')) return 'debug';
  if (normPath.includes('/components/deployment/')) return 'deployment';
  if (normPath.includes('/components/exhibitor/')) return 'exhibitor';
  if (normPath.includes('/components/forms/')) return 'forms';
  if (normPath.includes('/components/judges/')) return 'judges';
  if (normPath.includes('/components/offline/')) return 'offline';
  if (normPath.includes('/components/panels/')) return 'panels';
  if (normPath.includes('/components/rbac/')) return 'rbac';
  if (normPath.includes('/components/reports/')) return 'reports';
  if (normPath.includes('/components/subscription/')) return 'subscription';
  if (normPath.includes('/components/templates/')) return 'templates';
  if (normPath.includes('/components/trials/')) return 'trials';
  if (normPath.includes('/components/users/')) return 'users';
  if (normPath.includes('/components/common/')) return 'common';
  if (normPath.includes('/components/conflict/')) return 'conflict';
  if (normPath.includes('/components/collaboration/')) return 'collaboration';
  if (normPath.includes('/components/awards/')) return 'awards';
  if (normPath.includes('/components/landing/')) return 'landing';
  if (normPath.includes('/components/ui/')) return 'ui';
  if (normPath.includes('/components/')) return 'components';
  if (normPath.includes('/pages/admin/')) return 'admin';
  if (normPath.includes('/pages/scoring/')) return 'scoring';
  if (normPath.includes('/pages/secretary/')) return 'secretary';
  if (normPath.includes('/pages/')) return 'pages';
  if (normPath.includes('/utils/')) return 'utils';
  if (normPath.includes('/store/')) return 'store';
  if (normPath.includes('/lib/')) return 'lib';
  if (normPath.includes('/providers/')) return 'provider';
  if (normPath.includes('/contexts/')) return 'context';
  if (normPath.includes('/context/')) return 'context';
  if (normPath.includes('/config/')) return 'config';
  if (normPath.includes('/routes/')) return 'routing';
  if (normPath.includes('/test/')) return 'test';
  if (normPath.includes('/mockData/')) return 'mockData';
  return 'app';
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

  const category = getCategory(filePath);

  // Add import if not present
  const hasImport = content.includes("import { logger } from '@/services/LoggingService'");
  if (!hasImport) {
    const lines = content.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.match(/^import\s*\{/) || line.match(/^import\s*\*/)) {
        lastImportIndex = i;
      } else if (lastImportIndex >= 0 && line !== '' && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('}')) {
        // Check for multiline imports
        if (!lines[lastImportIndex].includes(';') && (line.includes('from ') || line.includes('}') || line.startsWith(','))) {
          lastImportIndex = i;
          continue;
        }
        break;
      }
    }

    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, "import { logger } from '@/services/LoggingService';");
      content = lines.join('\n');
    } else {
      content = "import { logger } from '@/services/LoggingService';\n\n" + content;
    }
  }

  // Apply replacements - from most specific to most general

  // Pattern: console.log('message', var1, var2) - with multiple args after string
  content = content.replace(/console\.log\((['"`][^'"`\n]+['"`]),\s*([^)]+)\);/g, (match, msg, args) => {
    // Don't process if already migrated
    if (match.includes('logger.')) return match;
    return `logger.debug(${msg}, '${category}', { data: ${args.trim()} });`;
  });

  // Pattern: console.warn('message', var1, var2)
  content = content.replace(/console\.warn\((['"`][^'"`\n]+['"`]),\s*([^)]+)\);/g, (match, msg, args) => {
    if (match.includes('logger.')) return match;
    // Check if last arg looks like an error
    const trimmedArgs = args.trim();
    if (trimmedArgs.match(/error|err|e$/i)) {
      return `logger.warn(${msg}, '${category}', {}, ${trimmedArgs} as Error);`;
    }
    return `logger.warn(${msg}, '${category}', { data: ${trimmedArgs} });`;
  });

  // Pattern: console.error('message', error)
  content = content.replace(/console\.error\((['"`][^'"`\n]+['"`]),\s*(\w+)\);/g, (match, msg, errVar) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${msg}, '${category}', {}, ${errVar} as Error);`;
  });

  // Pattern: console.error('message', err.message) or similar
  content = content.replace(/console\.error\((['"`][^'"`\n]+['"`]),\s*(\w+\.\w+)\);/g, (match, msg, prop) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${msg}, '${category}', { detail: ${prop} });`;
  });

  // Simple patterns - single string argument
  content = content.replace(/console\.log\((['"`][^'"`\n]+['"`])\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.debug(${msg}, '${category}', {});`;
  });

  content = content.replace(/console\.warn\((['"`][^'"`\n]+['"`])\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.warn(${msg}, '${category}', {});`;
  });

  content = content.replace(/console\.error\((['"`][^'"`\n]+['"`])\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${msg}, '${category}', {});`;
  });

  // Template literals (backticks)
  content = content.replace(/console\.log\((`[^`]+`)\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.debug(${msg}, '${category}', {});`;
  });

  content = content.replace(/console\.warn\((`[^`]+`)\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.warn(${msg}, '${category}', {});`;
  });

  content = content.replace(/console\.error\((`[^`]+`)\);/g, (match, msg) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${msg}, '${category}', {});`;
  });

  // Template literals with args
  content = content.replace(/console\.log\((`[^`]+`),\s*([^)]+)\);/g, (match, msg, args) => {
    if (match.includes('logger.')) return match;
    return `logger.debug(${msg}, '${category}', { data: ${args.trim()} });`;
  });

  content = content.replace(/console\.warn\((`[^`]+`),\s*([^)]+)\);/g, (match, msg, args) => {
    if (match.includes('logger.')) return match;
    return `logger.warn(${msg}, '${category}', { data: ${args.trim()} });`;
  });

  content = content.replace(/console\.error\((`[^`]+`),\s*(\w+)\);/g, (match, msg, errVar) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${msg}, '${category}', {}, ${errVar} as Error);`;
  });

  // Variable only (no string)
  content = content.replace(/console\.log\((\w+)\);/g, (match, varName) => {
    if (match.includes('logger.')) return match;
    return `logger.debug('${varName}', '${category}', { ${varName} });`;
  });

  // String concatenation
  content = content.replace(/console\.log\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, (match, expr) => {
    if (match.includes('logger.')) return match;
    return `logger.debug(${expr}, '${category}', {});`;
  });

  content = content.replace(/console\.warn\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, (match, expr) => {
    if (match.includes('logger.')) return match;
    return `logger.warn(${expr}, '${category}', {});`;
  });

  content = content.replace(/console\.error\((['"`][^'"`\n]*['"`]\s*\+\s*[^)]+)\);/g, (match, expr) => {
    if (match.includes('logger.')) return match;
    return `logger.error(${expr}, '${category}', {});`;
  });

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
    } else if (result.status === 'unchanged') {
      unchanged++;
      console.log(`~ ${path.relative(srcDir, file)} (complex)`);
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
