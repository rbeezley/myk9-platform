// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-817: the list toolkit (components/list-toolkit) replaced the per-page
 * filter, search and bulk-bar controls. This guard fails when a page imports
 * one of the retired modules again, or hand-rolls a filter pill.
 *
 * Declared lists, not a scan that guesses: RETIRED_MODULES names every module
 * the toolkit replaced and deleted; EXEMPT_IMPORTERS is the (currently empty)
 * allowlist of files that may still import one, with a reason. Ringside and
 * judge lists are exempt from the toolkit (MYK9-816) but none of them imports a
 * retired module, so nothing is exempt today.
 *
 * Matching is on import specifiers (import/export-from, dynamic import,
 * require, vi.mock/doMock/importActual) with comments stripped first, so a
 * comment naming a module neither satisfies nor trips the guard.
 */
const SRC = resolve(__dirname, '../..');

/** Module paths relative to src/, no extension. */
const RETIRED_MODULES = [
  'components/common/FilterChips',
  'components/common/ListControls',
  'components/common/ResultsCount',
  'components/common/StatusFilter',
  'components/shows/browse/ShowSearchBar',
  'components/offline-checkin/CheckInSearchBar',
  'components/admin/users/UserFilters',
  'pages/admin/UserManagementStats',
  'pages/exhibitor/PaymentYearFilter',
  'components/classes/ClassManagementViewControls',
  'components/classes/ClassLifecyclePresetTiles',
  'components/entries/management/TrialClassFilters',
  'components/entries/management/EntryBulkActionMenu',
  'components/entries/management/EntryRegistrationSelectionToolbar',
  'pages/secretary/ResultsControlPage/BulkOperationsBar',
  'features/operational-views/SavedViewsControl',
  'features/operational-views/CopyViewLinkButton',
];

/** Source file (relative to src/) -> why it may import a retired module. */
const EXEMPT_IMPORTERS: Record<string, string> = {};

/**
 * Files that still carry aria-pressed, with the exact count. A filter pill is
 * a toolkit ListFilterBar / ListViewTabs job; every entry below is either a
 * genuine non-filter toggle or a filter row no batch replaced yet. A new file,
 * or a changed count, fails until someone decides which it is.
 */
const ARIA_PRESSED_DECLARED: Record<string, { count: number; reason: string }> = {
  'features/show-map/cockpit/CockpitTrialGroup.tsx': {
    count: 1,
    reason: 'focus toggle on a schedule row, not a filter',
  },
  'features/show-map/cockpit/SecretaryCockpit.tsx': {
    count: 2,
    reason: 'show-day picker (All days / one day, MYK9-955): a day row, not yet replaced',
  },
  'features/at-show/AtShowScoresheetPage.tsx': { count: 1, reason: 'ringside scoring toggle' },
  'features/operational-views/EntryDisplayPresetControl.tsx': {
    count: 1,
    reason: 'display preset, not a filter',
  },
  'components/dogs/DogDetails/TrainingJournal/RichTextEditor.tsx': {
    count: 1,
    reason: 'text formatting toggle',
  },
  'components/askq/AskQModeSelector.tsx': { count: 1, reason: 'mode selector' },
  'components/entries/management/PullReconciliationActions.tsx': {
    count: 2,
    reason: 'refund/denied decision, not a filter',
  },
  'components/announcements/CreateAnnouncementDialog.tsx': { count: 1, reason: 'form toggle' },
  'components/admin/users/BulkRoleEditPanel.tsx': { count: 1, reason: 'role chip in a form' },
  'components/shows/RegistrationWorkflow/PaymentStep/PaymentMethodSelector.tsx': {
    count: 2,
    reason: 'payment method choice',
  },
  'pages/PricingPage.tsx': { count: 2, reason: 'billing period toggle' },
  'pages/secretary/ReportsPage/ReportPhaseSections.tsx': {
    count: 1,
    reason: 'selected report card, a report chooser rather than a list filter',
  },
  'pages/secretary/ShowResultsSection.tsx': {
    count: 1,
    reason: 'results section chip, not a list filter',
  },
  'pages/secretary/ResultsControlPage/PresetSelector.tsx': {
    count: 1,
    reason: 'results preset, not a filter',
  },
};

/** Files where a TabsTrigger label may carry a "(n)" count. None today. */
const TAB_COUNT_DECLARED: Record<string, string> = {};

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function allSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' ? [] : allSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const SPECIFIER = /\b(?:from|import|require|mock|doMock|importActual)\s*\(?\s*['"]([^'"]+)['"]/g;

function importedModules(file: string, source: string): string[] {
  const out: string[] = [];
  for (const match of stripComments(source).matchAll(SPECIFIER)) {
    const spec = match[1];
    let target: string | null = null;
    if (spec.startsWith('@/')) target = spec.slice(2);
    else if (spec.startsWith('.')) target = relative(SRC, resolve(dirname(file), spec));
    if (target) out.push(target.replace(/\.(tsx?|jsx?)$/, ''));
  }
  return out;
}

function findRetiredImports(
  files: Record<string, string>,
  retired: string[],
  exempt: Record<string, string>
): string[] {
  const hits: string[] = [];
  for (const [rel, source] of Object.entries(files)) {
    if (rel in exempt) continue;
    for (const mod of importedModules(join(SRC, rel), source)) {
      if (retired.includes(mod)) hits.push(`${rel} imports ${mod}`);
    }
  }
  return hits;
}

const ARIA_PRESSED = /\baria-pressed\b/g;
const TAB_COUNT = /<TabsTrigger\b[^>]*>[^<]*\(\s*(?:\{|\$\{)/g;

const files: Record<string, string> = Object.fromEntries(
  allSourceFiles(SRC).map(path => [relative(SRC, path), readFileSync(path, 'utf8')])
);
// This file names every banned module in its own lists.
delete files['test/ci/listToolkitGuard.test.ts'];

describe('list toolkit guard (MYK9-817)', () => {
  it('no source or test file imports a retired per-page list control', () => {
    expect(findRetiredImports(files, RETIRED_MODULES, EXEMPT_IMPORTERS)).toEqual([]);
  });

  it('every retired module is really gone from disk', () => {
    const present = RETIRED_MODULES.filter(m =>
      [`${m}.tsx`, `${m}.ts`].some(p => {
        try {
          return statSync(join(SRC, p)).isFile();
        } catch {
          return false;
        }
      })
    );
    expect(present).toEqual([]);
  });

  it('the exempt allowlist names only files that still exist and import something retired', () => {
    for (const rel of Object.keys(EXEMPT_IMPORTERS)) {
      expect(files[rel], `${rel} is exempt but missing`).toBeDefined();
      expect(findRetiredImports({ [rel]: files[rel] }, RETIRED_MODULES, {}).length).toBeGreaterThan(
        0
      );
    }
  });

  it('the HealthBoardPrimitives FilterTabs export stays deleted', () => {
    const source = stripComments(files['pages/admin/SystemHealth/HealthBoardPrimitives.tsx']);
    expect(source).not.toMatch(/\bFilterTabs\b/);
  });

  it('aria-pressed appears only in declared files, with the declared count', () => {
    const actual: Record<string, number> = {};
    for (const [rel, source] of Object.entries(files)) {
      if (/\.(test|spec)\.tsx?$/.test(rel) || rel.startsWith('test/')) continue;
      const n = stripComments(source).match(ARIA_PRESSED)?.length ?? 0;
      if (n > 0) actual[rel] = n;
    }
    const declared = Object.fromEntries(
      Object.entries(ARIA_PRESSED_DECLARED).map(([f, d]) => [f, d.count])
    );
    expect(actual).toEqual(declared);
  });

  it('no TabsTrigger label carries a "(n)" count outside the declared list', () => {
    const offenders = Object.entries(files)
      .filter(([rel]) => !/\.(test|spec)\.tsx?$/.test(rel) && !(rel in TAB_COUNT_DECLARED))
      .filter(([, source]) => new RegExp(TAB_COUNT).test(stripComments(source)))
      .map(([rel]) => rel);
    expect(offenders).toEqual([]);
  });

  describe('known-answer fixtures (the guard can fail)', () => {
    const retired = ['components/common/FilterChips'];

    it('flags an alias import, a relative import and a vi.mock of a retired module', () => {
      const hits = findRetiredImports(
        {
          'pages/A.tsx': `import { FilterChips } from '@/components/common/FilterChips';`,
          'pages/B.tsx': `import { FilterChips } from '../components/common/FilterChips';`,
          'pages/C.test.tsx': `vi.mock('@/components/common/FilterChips', () => ({}));`,
          'pages/D.tsx': `export { FilterChips } from '@/components/common/FilterChips.tsx';`,
          'pages/E.tsx': `const m = await import('@/components/common/FilterChips');`,
        },
        retired,
        {}
      );
      expect(hits).toHaveLength(5);
    });

    it('ignores a comment or a string that merely names the module', () => {
      const hits = findRetiredImports(
        {
          'pages/A.tsx': `// import { FilterChips } from '@/components/common/FilterChips';\nconst x = 1;`,
          'pages/B.tsx': `/* from '@/components/common/FilterChips' */\nconst y = 2;`,
          'pages/C.tsx': `const s = 'components/common/FilterChips';`,
        },
        retired,
        {}
      );
      expect(hits).toEqual([]);
    });

    it('honours the exempt allowlist', () => {
      const hits = findRetiredImports(
        { 'pages/A.tsx': `import x from '@/components/common/FilterChips';` },
        retired,
        { 'pages/A.tsx': 'reason' }
      );
      expect(hits).toEqual([]);
    });

    it('the aria-pressed and tab-count patterns match real markup', () => {
      expect('<button aria-pressed={on}>').toMatch(new RegExp(ARIA_PRESSED));
      expect('<TabsTrigger value="a">Pending ({count})</TabsTrigger>').toMatch(
        new RegExp(TAB_COUNT)
      );
      expect('<TabsTrigger value="a">Pending ({`${n}`})').toMatch(new RegExp(TAB_COUNT));
      expect('<TabsTrigger value="a">Pending</TabsTrigger>').not.toMatch(new RegExp(TAB_COUNT));
    });
  });
});
