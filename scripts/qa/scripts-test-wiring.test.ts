// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkScriptsTestWiring,
  extractInvokedTestScripts,
  resolveScriptFiles,
  UNWIRED_ALLOWLIST,
} from './scripts-test-wiring';

const ROOT = resolve(__dirname, '../..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules') return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function loadRepo() {
  const testFiles = walk(join(ROOT, 'scripts'))
    .map(p => relative(ROOT, p))
    .filter(f => f.endsWith('.test.ts'))
    .sort();
  const packageScripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    .scripts as Record<string, string>;
  const workflowDir = join(ROOT, '.github/workflows');
  const workflowTexts = readdirSync(workflowDir)
    .filter(f => /\.ya?ml$/.test(f))
    .map(f => readFileSync(join(workflowDir, f), 'utf8'));
  return { testFiles, packageScripts, workflowTexts };
}

describe('scripts test wiring: the real repo', () => {
  it('runs every scripts/**/*.test.ts file from a CI-invoked qa:*:test script (or allowlists it)', () => {
    const result = checkScriptsTestWiring(loadRepo());
    expect(result.unwired, 'test files no CI-invoked script runs').toEqual([]);
    expect(result.staleAllowlist, 'stale allowlist entries').toEqual([]);
  });

  it('covers this guard itself (self-coverage) and sees the universe', () => {
    const repo = loadRepo();
    const result = checkScriptsTestWiring(repo);
    expect(repo.testFiles.length).toBeGreaterThan(50);
    expect(Object.values(result.coverage).flat()).toContain(
      'scripts/qa/scripts-test-wiring.test.ts'
    );
    expect(result.invokedScripts).toContain('qa:scripts-test-wiring:test');
  });

  it('goes red when a file is dropped from a script (mutation check on real data)', () => {
    const repo = loadRepo();
    const mutated = {
      ...repo,
      packageScripts: {
        ...repo.packageScripts,
        'qa:inflight:test': 'vitest run scripts/qa/inflight.test.ts',
      },
    };
    expect(checkScriptsTestWiring(mutated).unwired).toEqual(['scripts/qa/gh-pages.test.ts']);
  });

  it('allowlist entries all carry a reason', () => {
    for (const entry of UNWIRED_ALLOWLIST) expect(entry.reason.trim().length).toBeGreaterThan(10);
  });
});

describe('scripts test wiring: known-answer fixtures', () => {
  const testFiles = ['scripts/a.test.ts', 'scripts/qa/b.test.ts', 'scripts/dir/c.test.ts'];
  const workflow = [
    'steps:',
    '  - run: |',
    '      pnpm qa:a:test',
    '      pnpm run qa:dir:test',
  ].join('\n');
  const scripts = {
    'qa:a:test': 'vitest run scripts/a.test.ts scripts/qa/*.test.ts --sequence.shuffle',
    'qa:dir:test': 'vitest run scripts/dir',
  };

  it('reports exactly the unwired file', () => {
    const result = checkScriptsTestWiring({
      testFiles: [...testFiles, 'scripts/qa/orphan.test.ts'].filter(
        f => f !== 'scripts/qa/b.test.ts'
      ),
      packageScripts: { ...scripts, 'qa:a:test': 'vitest run scripts/a.test.ts' },
      workflowTexts: [workflow],
      allowlist: [],
    });
    expect(result.unwired).toEqual(['scripts/qa/orphan.test.ts']);
  });

  it('passes when globs, directories and files cover everything', () => {
    const result = checkScriptsTestWiring({
      testFiles,
      packageScripts: scripts,
      workflowTexts: [workflow],
      allowlist: [],
    });
    expect(result.unwired).toEqual([]);
    expect(result.staleAllowlist).toEqual([]);
  });

  it('does not count a script no workflow invokes', () => {
    const result = checkScriptsTestWiring({
      testFiles,
      packageScripts: scripts,
      workflowTexts: ['run: pnpm qa:a:test'],
      allowlist: [],
    });
    expect(result.unwired).toEqual(['scripts/dir/c.test.ts']);
  });

  it('ignores commented-out invocations', () => {
    expect(extractInvokedTestScripts('# pnpm qa:a:test\n  run: pnpm qa:b:test')).toEqual([
      'qa:b:test',
    ]);
  });

  it('honours the allowlist, and fails a stale one (missing file or covered file)', () => {
    const base = { testFiles, packageScripts: scripts, workflowTexts: [workflow] };
    const result = checkScriptsTestWiring({
      ...base,
      testFiles: [...testFiles, 'scripts/x.test.ts'],
      allowlist: [
        { file: 'scripts/x.test.ts', reason: 'deliberately local only' },
        { file: 'scripts/gone.test.ts', reason: 'file was deleted' },
        { file: 'scripts/a.test.ts', reason: 'but it is wired' },
      ],
    });
    expect(result.unwired).toEqual([]);
    expect(result.staleAllowlist).toEqual(['scripts/a.test.ts', 'scripts/gone.test.ts']);
  });

  it('throws, naming the script, on an unknown runner, flag, or dead argument', () => {
    expect(() => resolveScriptFiles('qa:x:test', 'jest scripts/a.test.ts', testFiles)).toThrow(
      /"qa:x:test".*unrecognised command/
    );
    expect(() =>
      resolveScriptFiles('qa:x:test', 'vitest run scripts/a.test.ts --reporter=dot', testFiles)
    ).toThrow(/"qa:x:test".*--reporter=dot/);
    expect(() =>
      resolveScriptFiles('qa:x:test', 'vitest run scripts/nope.test.ts', testFiles)
    ).toThrow(/"qa:x:test".*matches no/);
    expect(() => resolveScriptFiles('qa:x:test', 'vitest run', testFiles)).toThrow(
      /names no files/
    );
  });

  it('understands chained commands and the tsx/node runners', () => {
    expect(
      resolveScriptFiles(
        'qa:x:test',
        'vitest run scripts/a.test.ts && tsx --test scripts/qa/b.test.ts && node --test scripts/x.test.js',
        testFiles
      )
    ).toEqual(['scripts/a.test.ts', 'scripts/qa/b.test.ts']);
  });
});
