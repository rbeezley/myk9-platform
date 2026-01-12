const fs = require('fs');
const path = require('path');

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

// Find and replace console statements including multiline ones
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Skip if no console statements
  if (!content.includes('console.log') && !content.includes('console.warn') && !content.includes('console.error')) {
    return { status: 'skipped' };
  }

  const category = getCategory(filePath);

  // Add import if not present
  if (!content.includes("import { logger } from '@/services/LoggingService'")) {
    const lines = content.split('\n');
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.match(/^import\s*\{/) || line.match(/^import\s*\*/)) {
        lastImportIndex = i;
      } else if (lastImportIndex >= 0 && line !== '' && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('}')) {
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

  // Handle multiline console statements by finding balanced parentheses
  function findConsoleCall(str, startIndex) {
    const match = str.slice(startIndex).match(/console\.(log|warn|error)\s*\(/);
    if (!match) return null;

    const methodStart = startIndex + match.index;
    const methodType = match[1];
    const argsStart = methodStart + match[0].length;

    // Find the matching closing parenthesis
    let depth = 1;
    let i = argsStart;
    while (i < str.length && depth > 0) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;
      i++;
    }

    if (depth !== 0) return null;

    const argsEnd = i - 1;
    const args = str.slice(argsStart, argsEnd).trim();

    // Check for semicolon
    let endIndex = i;
    while (endIndex < str.length && /\s/.test(str[endIndex])) endIndex++;
    if (str[endIndex] === ';') endIndex++;

    return {
      start: methodStart,
      end: endIndex,
      type: methodType,
      args: args,
      full: str.slice(methodStart, endIndex)
    };
  }

  // Process all console calls
  let pos = 0;
  let modified = false;

  while (true) {
    const call = findConsoleCall(content, pos);
    if (!call) break;

    // Skip if already migrated (shouldn't happen but just in case)
    if (call.full.includes('logger.')) {
      pos = call.end;
      continue;
    }

    // Determine replacement based on method type and args
    let replacement;
    const args = call.args;

    // Check if it's a simple string argument
    const simpleStringMatch = args.match(/^(['"`])([^'"`]*)\1$/);
    const templateLiteralMatch = args.match(/^`[^`]+`$/);

    if (simpleStringMatch || templateLiteralMatch) {
      // Simple string or template literal
      const msg = args;
      if (call.type === 'log') {
        replacement = `logger.debug(${msg}, '${category}', {});`;
      } else if (call.type === 'warn') {
        replacement = `logger.warn(${msg}, '${category}', {});`;
      } else {
        replacement = `logger.error(${msg}, '${category}', {});`;
      }
    } else if (args.includes(',')) {
      // Multiple arguments
      const firstComma = findFirstComma(args);
      if (firstComma > 0) {
        const firstArg = args.slice(0, firstComma).trim();
        const restArgs = args.slice(firstComma + 1).trim();

        // Check if first arg is a string
        if (firstArg.match(/^['"`]/) || firstArg.match(/^`/)) {
          if (call.type === 'error' && restArgs.match(/^\w+$/)) {
            // Error with error object
            replacement = `logger.error(${firstArg}, '${category}', {}, ${restArgs} as Error);`;
          } else if (call.type === 'warn' && restArgs.match(/^\w+$/)) {
            // Warn with possible error
            replacement = `logger.warn(${firstArg}, '${category}', {}, ${restArgs} as Error);`;
          } else {
            // String with data
            if (call.type === 'log') {
              replacement = `logger.debug(${firstArg}, '${category}', { data: ${restArgs} });`;
            } else if (call.type === 'warn') {
              replacement = `logger.warn(${firstArg}, '${category}', { data: ${restArgs} });`;
            } else {
              replacement = `logger.error(${firstArg}, '${category}', { data: ${restArgs} });`;
            }
          }
        } else {
          // Variable/expression - convert to object style
          if (call.type === 'log') {
            replacement = `logger.debug('Debug', '${category}', { data: ${args} });`;
          } else if (call.type === 'warn') {
            replacement = `logger.warn('Warning', '${category}', { data: ${args} });`;
          } else {
            replacement = `logger.error('Error', '${category}', { data: ${args} });`;
          }
        }
      } else {
        // Couldn't find comma properly, use generic
        if (call.type === 'log') {
          replacement = `logger.debug('Debug', '${category}', { data: ${args} });`;
        } else if (call.type === 'warn') {
          replacement = `logger.warn('Warning', '${category}', { data: ${args} });`;
        } else {
          replacement = `logger.error('Error', '${category}', { data: ${args} });`;
        }
      }
    } else {
      // Single non-string argument (variable)
      const varName = args.trim();
      if (call.type === 'log') {
        replacement = `logger.debug('${varName}', '${category}', { ${varName}: ${args} });`;
      } else if (call.type === 'warn') {
        replacement = `logger.warn('${varName}', '${category}', { ${varName}: ${args} });`;
      } else {
        replacement = `logger.error('${varName}', '${category}', { ${varName}: ${args} });`;
      }
    }

    content = content.slice(0, call.start) + replacement + content.slice(call.end);
    modified = true;
    pos = call.start + replacement.length;
  }

  if (modified || content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { status: 'processed' };
  }

  return { status: 'unchanged' };
}

// Find the first comma that's not inside nested parentheses/brackets/braces
function findFirstComma(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}

// Process specific files
const files = [
  'apps/myk9show/src/components/alerts/AlertDashboard.tsx',
  'apps/myk9show/src/components/clubs/members/MemberList.tsx',
  'apps/myk9show/src/components/common/ErrorBoundary.tsx',
  'apps/myk9show/src/components/common/TimerIntegration.tsx',
  'apps/myk9show/src/components/conflict/ConflictNotifications.tsx',
  'apps/myk9show/src/components/dogs/DogDetails/DogDetailsView.tsx',
  'apps/myk9show/src/components/dogs/DogDetails/HealthRecords/HealthRecordsSection.tsx',
  'apps/myk9show/src/components/panels/edit/UserEditPanel.tsx',
  'apps/myk9show/src/components/panels/PanelManager.ts',
  'apps/myk9show/src/components/scoring/ResultEntryNavigation.tsx',
  'apps/myk9show/src/components/shows/EnhancedEmptyStates.tsx',
  'apps/myk9show/src/components/shows/RegistrationWorkflow/RegistrationWorkflow.tsx',
  'apps/myk9show/src/components/shows/ShowDetails/ShowGroupedSidebar.tsx',
  'apps/myk9show/src/components/sync/EntryCountReconciliation.tsx',
  'apps/myk9show/src/components/sync/ScheduleConflictAlerts.tsx',
  'apps/myk9show/src/components/sync/SyncDemoPage.tsx',
  'apps/myk9show/src/components/templates/admin/FieldConfiguratorWorking.tsx',
  'apps/myk9show/src/components/ui/AppleDialog.tsx',
  'apps/myk9show/src/hooks/useFieldLevelSync.ts',
  'apps/myk9show/src/lib/errorMonitoring.ts',
  'apps/myk9show/src/lib/networkUtils.ts',
  'apps/myk9show/src/pages/OfflineTestPage.tsx',
  'apps/myk9show/src/pages/scoring/hooks/useEntryNavigationHelpers.ts',
  'apps/myk9show/src/routes/utils/SuspenseWrapper.tsx',
  'apps/myk9show/src/services/database/performance/performanceMonitor.ts',
  'apps/myk9show/src/services/database/queries/dogQueries.ts',
  'apps/myk9show/src/services/database/queries/userQueries.ts',
  'apps/myk9show/src/services/database/supabaseClient.ts',
  'apps/myk9show/src/services/database/test-indexeddb.ts',
  'apps/myk9show/src/services/database/utils/retryWrapper.ts',
  'apps/myk9show/src/services/realtime/RealtimeEventBus.ts',
  'apps/myk9show/src/test/config/testOptimization.ts',
  'apps/myk9show/src/test/load/DatabaseLoadTests.ts',
  'apps/myk9show/src/test/load/LoadTestRunner.ts',
  'apps/myk9show/src/test/performance/measure-loading-performance.ts',
  'apps/myk9show/src/test/setup/global-setup.ts',
  'apps/myk9show/src/utils/logger.ts',
  'apps/myk9show/src/utils/standardizedErrorHandler.ts'
];

let processed = 0;
let unchanged = 0;

files.forEach(file => {
  try {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      const result = processFile(fullPath);
      if (result.status === 'processed') {
        processed++;
        console.log(`✓ ${file}`);
      } else {
        unchanged++;
        console.log(`~ ${file}`);
      }
    } else {
      console.log(`✗ ${file} (not found)`);
    }
  } catch (e) {
    console.log(`✗ ${file}: ${e.message}`);
  }
});

console.log(`\nProcessed: ${processed}`);
console.log(`Unchanged: ${unchanged}`);
