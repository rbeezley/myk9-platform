// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Guard for LESSON vitest-hook-returns-teardown (MYK9-1707, split from MYK9-1654).
 *
 * Vitest calls a function returned from a hook as that test's cleanup, and
 * mock setters return the mock, so `beforeEach(() => fn.mockReset())` calls
 * `fn` once more after every test. `apps/myk9show/eslint.config.js` bans the
 * concise arrow (MYK9-787), but only app files are linted: root
 * `eslint.config.js` ignores test files and most packages have no lint
 * script, which is where every remaining instance was found. This test covers
 * every tracked test file in the repository with the same rule.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');
const HOOKS = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);

/** 1-based line numbers of hook calls whose first argument is a concise-body arrow. */
export function conciseHookLines(source: string): number[] {
  if (!/\b(before|after)(Each|All)\b/.test(source)) return [];
  const sf = ts.createSourceFile('f.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const first = node.arguments[0];
      if (
        HOOKS.has(node.expression.text) &&
        first &&
        ts.isArrowFunction(first) &&
        !ts.isBlock(first.body)
      ) {
        lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

describe('vitest hook block-body guard: known answers', () => {
  it('flags a concise arrow in each hook', () => {
    expect(conciseHookLines('beforeEach(() => fn.mockReset());')).toEqual([1]);
    expect(conciseHookLines('afterEach(async () => teardown(m));')).toEqual([1]);
    expect(conciseHookLines('beforeAll(() => setup());\nafterAll(() => stop());')).toEqual([1, 2]);
  });

  it('passes a braced body, sync or async', () => {
    expect(conciseHookLines('beforeEach(() => { fn.mockReset(); });')).toEqual([]);
    expect(conciseHookLines('afterEach(async () => { await teardown(m); });')).toEqual([]);
  });

  it('ignores mentions in comments and strings, and non-hook calls', () => {
    expect(conciseHookLines('// beforeEach(() => fn.mockReset());')).toEqual([]);
    expect(conciseHookLines("const s = 'beforeEach(() => fn())';")).toEqual([]);
    expect(conciseHookLines('items.forEach(() => fn());')).toEqual([]);
  });
});

describe('vitest hook block-body guard: repository', () => {
  it('no tracked test file passes a concise arrow to a vitest hook', () => {
    const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.test.ts', '*.test.tsx'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
    expect(tracked.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    let hookFiles = 0;
    for (const rel of tracked) {
      let src: string;
      try {
        src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      } catch {
        continue; // tracked but deleted in the working tree
      }
      if (/\b(before|after)(Each|All)\(/.test(src)) hookFiles++;
      for (const line of conciseHookLines(src)) offenders.push(`${rel}:${line}`);
    }

    // Positive control: the scan must actually see files that use hooks.
    expect(hookFiles).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
