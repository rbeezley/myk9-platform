import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-48 task 3.1 (updated MYK9-811) — Class Management's status filtering
 * must reuse the existing `deriveClassLifecycleValue` derivation, not
 * re-implement a second raw-status -> lifecycle mapping. The list-toolkit
 * rollout moved the filtering itself out of the page and into
 * `filterManagedClasses` (`classManagementFilters.ts`), the single function
 * the page, its view counts and its filter-chip counts all share — this pins
 * THAT file's source so a future edit can't reintroduce a duplicated
 * switch/lookup without failing CI.
 */
function readFilterSource(): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', 'components', 'classes', 'classManagementFilters.ts'),
    'utf8'
  );
}

function readPageSource(): string {
  return readFileSync(join(__dirname, '..', 'ClassManagementPage.tsx'), 'utf8');
}

describe('ClassManagementPage lifecycle filter reuse', () => {
  it('imports deriveClassLifecycleValue from the shared classLifecycle module', () => {
    expect(readFilterSource()).toMatch(
      /import\s*\{\s*deriveClassLifecycleValue[^}]*\}\s*from\s*'@\/lib\/status\/classLifecycle'/
    );
  });

  it('filters by calling deriveClassLifecycleValue against the status filter, not a raw status compare', () => {
    const source = readFilterSource();
    expect(source).toContain('deriveClassLifecycleValue(cls.status) === filters.status');
    // The old raw-status comparison must be gone.
    expect(source).not.toContain('cls.status === filters.status');
  });

  it('does not define a second lifecycle/status mapping table in the filter helper', () => {
    const source = readFilterSource();
    // No local switch statement or CLASS_STATUS-keyed record redefining the
    // lifecycle buckets — the only source of truth is the imported helper.
    expect(source).not.toMatch(/switch\s*\(\s*(cls\.status|status)\s*\)/);
    expect(source).not.toContain('CLASS_STATUS');
  });

  it('the page itself no longer inlines status filtering (single source of truth)', () => {
    const source = readPageSource();
    expect(source).not.toContain('deriveClassLifecycleValue(');
    expect(source).toContain('filterManagedClasses(');
  });
});
