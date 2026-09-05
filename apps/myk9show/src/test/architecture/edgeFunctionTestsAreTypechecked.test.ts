/**
 * Every edge-function test vitest RUNS must also be a file `tsc` SEES.
 *
 * Before this guard, `vitest.config.ts` `test.include` listed ~94 test files
 * under `supabase/functions/**` (both the app-local tree and the repo-root one)
 * while `tsconfig.test.json` / `tsconfig.app.json` covered only `src/**`. Vitest
 * transpiles without typechecking, so those files ran in CI and were invisible
 * to `pnpm typecheck` — a type error in a money-path or authz handler could not
 * fail the build. `tsconfig.edge-tests.json` closes that, and this test keeps
 * the two hand-maintained allowlists from drifting apart again (the same trap
 * CLAUDE.md LESSONS records for the SQL and edge-function runner allowlists).
 *
 * Both directions matter:
 *  - vitest ⊄ tsconfig: a newly registered test runs untypechecked (the
 *    original bug).
 *  - tsconfig ⊄ vitest: the TS project reaches a file vitest deliberately
 *    excludes. Those exclusions are not arbitrary — several `_shared` modules
 *    import Deno-only `npm:` specifiers that neither runner can resolve, so
 *    pulling one in breaks `tsc` on an unresolvable specifier.
 */
import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const APP_ROOT = path.resolve(__dirname, '../../..');
const EDGE_TESTS_TSCONFIG = path.join(APP_ROOT, 'tsconfig.edge-tests.json');
const VITEST_CONFIG = path.join(APP_ROOT, 'vitest.config.ts');

/** Ambient-only files that carry no test and so have no vitest counterpart. */
const DECLARATION_ONLY = new Set([path.join(APP_ROOT, 'types/edge-runtime.d.ts')]);

/**
 * Read `test.include` out of the config SOURCE rather than importing it —
 * importing vitest.config.ts pulls in `@vitejs/plugin-react`, and esbuild
 * refuses to load under this suite's jsdom environment.
 */
function vitestIncludePatterns(): string[] {
  const source = readFileSync(VITEST_CONFIG, 'utf8');
  const block = /\n\s*include: \[\n(.*?)\n\s*\],\n/s.exec(source);

  expect(block).not.toBeNull();

  // Drop `//` commentary first — the comments in that block contain apostrophes
  // ("vitest can't load"), which a bare quote scan would read as pattern
  // delimiters and desync from there on.
  const patterns = block![1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('//'))
    .join('\n');

  return [...patterns.matchAll(/'([^']+)'/g)].map(match => match[1]!);
}

function vitestEdgeTestFiles(): Set<string> {
  const edgePatterns = vitestIncludePatterns().filter(pattern =>
    pattern.includes('supabase/functions')
  );

  expect(edgePatterns.length).toBeGreaterThan(0);

  return new Set(
    edgePatterns
      .flatMap(pattern => globSync(pattern, { cwd: APP_ROOT }))
      .map(file => path.resolve(APP_ROOT, file))
  );
}

function typecheckedFiles(): Set<string> {
  const raw = ts.readConfigFile(EDGE_TESTS_TSCONFIG, ts.sys.readFile);
  expect(raw.error).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(
    raw.config,
    ts.sys,
    APP_ROOT,
    undefined,
    EDGE_TESTS_TSCONFIG
  );
  expect(parsed.errors).toEqual([]);

  return new Set(parsed.fileNames.map(file => path.resolve(file)));
}

/**
 * Edge-function tests that exist on disk but are DELIBERATELY not run by
 * vitest, each with the reason. Every entry must still exist — a stale entry
 * fails — so this list cannot quietly outlive the file it excuses. Empty on
 * 2026-09-05: the eight files that were unrun then all pass once registered.
 */
const DELIBERATELY_UNRUN: Readonly<Record<string, string>> = {};

function edgeTestFilesOnDisk(): Set<string> {
  return new Set(
    ['supabase/functions/**/*.test.ts', '../../supabase/functions/**/*.test.ts']
      .flatMap(pattern => globSync(pattern, { cwd: APP_ROOT }))
      .filter(file => !file.includes('node_modules'))
      .map(file => path.resolve(APP_ROOT, file))
  );
}

const rel = (files: Iterable<string>) =>
  [...files].map(file => path.relative(APP_ROOT, file)).sort();

describe('every edge-function test on disk is run', () => {
  it('runs every *.test.ts under both edge trees, or lists it with a reason', () => {
    // The two-list agreement checks below catch a test REMOVED from one list.
    // They cannot catch one that was never added: a file absent from both lists
    // keeps them equal. Eight files sat that way on 2026-09-05 (fanout*,
    // revoke-self-auth-identity/*, send-auth-email/actionUrl+template,
    // send-targeted-message/targeting, send-waitlist-invite/auth). This reads
    // the directories so an omission — or a MOVE, which deregisters a file from
    // both lists at once — fails loudly.
    const run = vitestEdgeTestFiles();
    const excused = new Set(Object.keys(DELIBERATELY_UNRUN).map(f => path.resolve(APP_ROOT, f)));
    const unrun = [...edgeTestFilesOnDisk()].filter(file => !run.has(file) && !excused.has(file));
    expect(rel(unrun)).toEqual([]);
  });

  it('has no stale DELIBERATELY_UNRUN entry', () => {
    const onDisk = edgeTestFilesOnDisk();
    const stale = Object.keys(DELIBERATELY_UNRUN)
      .map(f => path.resolve(APP_ROOT, f))
      .filter(f => !onDisk.has(f));
    expect(rel(stale)).toEqual([]);
    for (const reason of Object.values(DELIBERATELY_UNRUN))
      expect(reason.trim().length).toBeGreaterThan(10);
  });
});

describe('edge-function tests are typechecked', () => {
  it('typechecks every edge-function test vitest runs', () => {
    const typechecked = typecheckedFiles();
    const missing = [...vitestEdgeTestFiles()].filter(file => !typechecked.has(file));

    expect(rel(missing)).toEqual([]);
  });

  it('does not typecheck edge-function files vitest excludes', () => {
    const run = vitestEdgeTestFiles();
    const extra = [...typecheckedFiles()].filter(
      file => !run.has(file) && !DECLARATION_ONLY.has(file)
    );

    expect(rel(extra)).toEqual([]);
  });
});
