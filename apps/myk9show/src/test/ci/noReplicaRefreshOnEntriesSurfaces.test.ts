// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1523: My Shows refreshes on return to the page (useRefreshOnReturn), not
 * by listening to replicated tables. A per-show replica snapshot cannot stand
 * in for the account-level read, and three review rounds proved the swap
 * unsound. This pins the decision at the files that own the refresh.
 */
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('entries surfaces do not refresh from replica notices', () => {
  it.each([
    ['MyEntriesPage/index.tsx', '../../pages/MyEntriesPage/index.tsx'],
    ['useMyEntriesData.ts', '../../pages/MyEntriesPage/modules/useMyEntriesData.ts'],
    ['useRefreshOnReturn.ts', '../../hooks/useRefreshOnReturn.ts'],
  ])('%s has no replicated-table subscription', (_name, relative) => {
    const source = read(relative);
    expect(source).not.toMatch(/@\/services\/replication/);
    expect(source).not.toMatch(/replicated\w+Table/);
    expect(source).not.toMatch(/\.subscribe\(/);
    expect(source).not.toMatch(/isMutating|useIsMutating|getMutationCache/);
  });

  it('My Shows wires the shared return hook', () => {
    expect(read('../../pages/MyEntriesPage/index.tsx')).toMatch(
      /useRefreshOnReturn\(refreshEntries/
    );
  });
});
