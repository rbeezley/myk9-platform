import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * pnpm appends extra CLI arguments to the END of a script string, so a script
 * that chains anything after its real command hands the caller's arguments to
 * the wrong process.
 *
 * MYK9-628: `test:e2e` used to be `playwright test && node scripts/auto-cleanup-after-test.js`,
 * so `pnpm test:e2e src/test/e2e/registration/` ran the WHOLE suite and handed
 * the paths to the cleanup script, which ignored them. (That script and its
 * `posttest:e2e` hooks were later deleted, MYK9-720.)
 *
 * MYK9-720: the root `typecheck` was `turbo typecheck && pnpm run typecheck:scripts`,
 * so `pnpm typecheck --filter=@myk9/ringside` typechecked EVERY package and
 * passed the filter to `typecheck:scripts`, which ignored it.
 *
 * The rule pinned here: a script that invokes one of these tools must end with
 * that invocation, so whatever pnpm appends lands on it.
 */
function readScripts(relativePath: string): Record<string, string> {
  return (
    JSON.parse(readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;
}

const appScripts = readScripts('../../../package.json');
const rootScripts = readScripts('../../../../../package.json');

/** True when args pnpm appends to `command` would reach `invocation`. */
function appendedArgsReach(command: string, invocation: string): boolean {
  const at = command.lastIndexOf(invocation);
  if (at === -1) return true;
  return !/&&|\|\||;|\|/.test(command.slice(at));
}

function offenders(scripts: Record<string, string>, invocation: string): string[] {
  return Object.entries(scripts)
    .filter(([, command]) => !appendedArgsReach(command, invocation))
    .map(([name]) => name);
}

describe('scripts forward CLI args to the tool they wrap (MYK9-628, MYK9-720)', () => {
  it('known answers: a chained command after the tool swallows the args', () => {
    expect(appendedArgsReach('playwright test && node cleanup.js', 'playwright test')).toBe(false);
    expect(appendedArgsReach('playwright test; node cleanup.js', 'playwright test')).toBe(false);
    expect(appendedArgsReach('playwright test | tee out.log', 'playwright test')).toBe(false);
    expect(appendedArgsReach('playwright test', 'playwright test')).toBe(true);
    expect(
      appendedArgsReach('cross-env X=1 playwright test --config=a.ts', 'playwright test')
    ).toBe(true);
    expect(
      appendedArgsReach('turbo typecheck && pnpm run typecheck:scripts', 'turbo typecheck')
    ).toBe(false);
    expect(
      appendedArgsReach('pnpm run typecheck:scripts && turbo typecheck', 'turbo typecheck')
    ).toBe(true);
  });

  it('test:e2e contains no && so `pnpm test:e2e <paths>` cannot hand the paths elsewhere', () => {
    expect(appScripts['test:e2e']).toBeDefined();
    expect(appScripts['test:e2e']).not.toContain('&&');
  });

  it('no app script chains anything after `playwright test`', () => {
    expect(offenders(appScripts, 'playwright test')).toEqual([]);
  });

  it('no post* hook is attached to an e2e script (the deleted cleanup ran as one)', () => {
    expect(Object.keys(appScripts).filter(name => /^posttest:e2e/.test(name))).toEqual([]);
  });

  it('root `pnpm typecheck --filter=<pkg>` hands the filter to turbo', () => {
    expect(rootScripts.typecheck).toContain('turbo typecheck');
    // `clean` is the one declared exception: `turbo clean` must run BEFORE
    // `rm -rf node_modules` deletes the turbo binary, so it cannot go last.
    const exempt = new Set(['clean']);
    expect(offenders(rootScripts, 'turbo ').filter(name => !exempt.has(name))).toEqual([]);
  });
});
