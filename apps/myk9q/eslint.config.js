import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'scripts',
      'coverage',             // Test coverage reports (generated files)
      '*.config.js',
      '*.config.ts',
      '**/*.backup',
      '**/*.test.ts',
      '**/*.test.tsx',
      '.claude/skills/**/assets/**',
      'tests/**',              // Test files (Playwright, etc.)
      'temp-*.ts',             // Temporary files
      'supabase/functions/**'  // Edge functions use Deno console logging
    ]
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-undef': 'off', // TypeScript handles this better
      'no-redeclare': 'off', // Use @typescript-eslint/no-redeclare for function overloads
      'no-console': ['warn', { allow: ['warn', 'error'] }], // Prevent debug console.log
      // DEBT-008: Complexity rules - prevent new high-complexity code
      // Previous worst offenders have been refactored:
      // - useStatsData.ts (86 → extracted to statsDataHelpers.ts)
      // - SortableEntryCard (64 → extracted to sortableEntryCardUtils.ts)
      // - ShowDetails (51 → extracted to ShowDetailsComponents.tsx)
      // - useEntryNavigation (38 → extracted to useEntryNavigationHelpers.ts)
      // - AKCNationalsScoresheet (38 → extracted to NationalsTimerSection, NationalsConfirmationDialog)
      // - dogDetailsDataHelpers (38 → refactored extractDerivedFields, buildClassEntry)
      // - preloadService (36 → extracted to preloadServiceHelpers.ts)
      // - CreateAnnouncementModal (35 → extracted to createAnnouncementComponents.tsx)
      // - DogDetails (33 → extracted to DogDetailsClassCard.tsx)
      // - EntryListHeader (33 → extracted to entryListHeaderHelpers.tsx)
      // - SubscriptionMonitor (32 → extracted to subscriptionMonitorComponents.tsx)
      // - notificationService (32 → extracted to notificationServiceHelpers.ts)
      // Threshold history: 90 → 50 → 40 → 30 (2025-12-03)
      // All files now below complexity 30!
      // TODO: Continue lowering: 30 -> 20 (target)
      'complexity': ['error', { max: 30 }], // Lowered from 40 (Dec 2025)
      'max-depth': ['error', { max: 8 }] // Current max in codebase is 8
    }
  }
];
