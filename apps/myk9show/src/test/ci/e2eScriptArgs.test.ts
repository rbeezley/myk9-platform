import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-628: pnpm appends extra CLI arguments to the END of a script string.
 * `test:e2e` used to be `playwright test && node scripts/auto-cleanup-after-test.js`,
 * so `pnpm test:e2e src/test/e2e/registration/` ran the WHOLE suite and handed
 * the paths to the cleanup script, which ignored them. Cleanup now lives in a
 * `posttest:e2e` hook (pnpm runs `post*` scripts with no args).
 *
 * The rule pinned here: any script that runs `playwright test` must end with
 * that command, so whatever pnpm appends lands on Playwright.
 */
const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8')
) as { scripts: Record<string, string> };

/** True when args pnpm appends to `command` would reach `playwright test`. */
function appendedArgsReachPlaywright(command: string): boolean {
  const at = command.lastIndexOf('playwright test');
  if (at === -1) return true;
  return !/&&|\|\||;|\|/.test(command.slice(at));
}

describe('e2e scripts forward CLI args to Playwright (MYK9-628)', () => {
  it('known answers: a chained command after playwright swallows the args', () => {
    expect(appendedArgsReachPlaywright('playwright test && node cleanup.js')).toBe(false);
    expect(appendedArgsReachPlaywright('playwright test; node cleanup.js')).toBe(false);
    expect(appendedArgsReachPlaywright('playwright test | tee out.log')).toBe(false);
    expect(appendedArgsReachPlaywright('playwright test')).toBe(true);
    expect(appendedArgsReachPlaywright('cross-env X=1 playwright test --config=a.ts')).toBe(true);
  });

  it('test:e2e contains no && so `pnpm test:e2e <paths>` cannot hand the paths to cleanup', () => {
    expect(pkg.scripts['test:e2e']).toBeDefined();
    expect(pkg.scripts['test:e2e']).not.toContain('&&');
  });

  it('every script that runs `playwright test` ends with it', () => {
    const offenders = Object.entries(pkg.scripts)
      .filter(([, command]) => !appendedArgsReachPlaywright(command))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});
