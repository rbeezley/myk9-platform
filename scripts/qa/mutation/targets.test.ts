// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXCLUDED_TESTS, MUTATION_TARGET_DEFS } from './targets.mjs';

const ROOT = resolve(__dirname, '../../..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.stryker-tmp', 'reports']);
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (SKIP_DIRS.has(entry.name)) return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Every local specifier in import / export-from / dynamic import / vi.mock / require calls:
 * relative ones, and `@/` (the app's alias for apps/myk9show/src). `import type` and
 * `export type` statements are dropped first: TypeScript erases them, so they never
 * evaluate the module and cannot cover a mutant.
 */
export function localSpecifiers(source: string): string[] {
  // Only the statement forms that carry a `from`: `import type X|{…}|* as X from`
  // and `export type {…}|* from`. A looser `export type <anything> … from` also
  // swallowed `export type Foo = {…}` and the runtime import on the next line.
  const runtime = source.replace(
    /\b(?:import\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)|export\s+type\s+(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?))\s*from\s*['"][^'"]+['"]/g,
    ''
  );
  const pattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|importActual|importMock)\s*\(\s*|\brequire\s*\(\s*)['"](\.{1,2}(?:\/[^'"]*)?|@\/[^'"]*)['"]/g;
  return [...runtime.matchAll(pattern)].flatMap(match => (match[1] ? [match[1]] : []));
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(ROOT, 'apps/myk9show/src', specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...EXTENSIONS.map(ext => base + ext),
    ...EXTENSIONS.map(ext => join(base, `index${ext}`)),
  ];
  // A `./x.js` specifier names `./x.ts` under TypeScript's resolution.
  if (/\.(?:js|mjs)$/.test(base)) {
    candidates.push(base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'));
  }
  return candidates.find(c => existsSync(c) && statSync(c).isFile()) ?? null;
}

/**
 * The mutated files plus every file that reaches one through `export ... from` alone
 * (a barrel such as index.ts), so a test importing the barrel counts as importing the
 * file. Deliberately NOT the full runtime import graph: that pulls in hundreds of
 * unrelated tests (every MutationManager and cart-page test), which would slow the
 * target and dilute the score. A test that reaches a mutated file only through other
 * logic modules is a judgement call and goes in the list by hand.
 */
function reachers(files: string[], mutated: Set<string>): Set<string> {
  const reach = new Set(mutated);
  const exportFrom =
    /\bexport\s+(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\s*['"]((?:\.{1,2}|@)\/[^'"]*|\.{1,2})['"]/g;
  let grew = true;
  while (grew) {
    grew = false;
    for (const file of files) {
      if (reach.has(file) || /\.test\.tsx?$/.test(file)) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(exportFrom)) {
        const target = match[1] ? resolveSpecifier(file, match[1]) : null;
        if (target && reach.has(target)) {
          reach.add(file);
          grew = true;
          break;
        }
      }
    }
  }
  return reach;
}

/** Test files under the mutated files' package that import any of them (directly or through a barrel). */
export function importingTests(mutate: string[], packageRoot: string): string[] {
  const files = walk(packageRoot).filter(f => EXTENSIONS.includes(f.slice(f.lastIndexOf('.'))));
  const reach = reachers(files, new Set(mutate.map(f => resolve(ROOT, f))));
  return files
    .filter(f => /\.test\.tsx?$/.test(f))
    .filter(f =>
      localSpecifiers(readFileSync(f, 'utf8')).some(spec => {
        const target = resolveSpecifier(f, spec);
        return target !== null && reach.has(target);
      })
    )
    .map(f => relative(ROOT, f))
    .sort();
}

/** The package directory (apps/x or packages/x) that holds a repo-relative path. */
function packageOf(file: string): string {
  const [group, name] = file.split('/');
  return join(ROOT, group ?? '', name ?? '');
}

export function missingTests(
  mutate: string[],
  testFiles: string[],
  excluded: Record<string, string> = {}
): string[] {
  const listed = new Set(testFiles);
  const packages = new Set(mutate.map(packageOf));
  return [...packages]
    .flatMap(pkg => importingTests(mutate, pkg))
    .filter(f => !listed.has(f) && !(f in excluded));
}

function defOf(name: string) {
  const def = MUTATION_TARGET_DEFS[name];
  if (!def) throw new Error(`unknown mutation target ${name}`);
  return def;
}

describe('mutation targets list every test that imports their mutated files', () => {
  for (const [name, def] of Object.entries(MUTATION_TARGET_DEFS)) {
    it(`${name}: no importing test is missing from testFiles`, () => {
      expect(missingTests(def.mutate, def.testFiles, EXCLUDED_TESTS[name])).toEqual([]);
    });

    it(`${name}: every listed path exists, and a test sees the mutated files`, () => {
      for (const file of [...def.mutate, ...def.testFiles]) {
        expect(existsSync(join(ROOT, file)), file).toBe(true);
      }
      // The scan must find something, or a broken resolver would pass vacuously.
      const found = def.mutate.flatMap(f => importingTests([f], packageOf(f)));
      expect(found.length, `${name}: scan found no importing test`).toBeGreaterThan(0);
    });
  }

  it('lists no excluded test that does not exist or is also listed', () => {
    for (const [name, excluded] of Object.entries(EXCLUDED_TESTS)) {
      for (const file of Object.keys(excluded)) {
        expect(existsSync(join(ROOT, file)), `${name}: ${file}`).toBe(true);
        expect(defOf(name).testFiles).not.toContain(file);
      }
    }
  });

  it('goes red when a listed file is dropped (mutation check on real data)', () => {
    const def = defOf('replication-conflict');
    const dropped = 'packages/replication/src/conflict/serverOwnedFields.test.ts';
    expect(def.testFiles).toContain(dropped);
    const without = def.testFiles.filter(f => f !== dropped);
    expect(missingTests(def.mutate, without)).toEqual([dropped]);
  });

  it('reads local specifiers, not bare names, packages or type-only imports', () => {
    expect(localSpecifiers(`import x from './a'; export * from "../b"; vi.mock('./c')`)).toEqual([
      './a',
      '../b',
      './c',
    ]);
    expect(localSpecifiers(`import type { A } from './t'; import { type B } from "@/u"`)).toEqual([
      '@/u',
    ]);
    expect(localSpecifiers(`const s = 'ConflictResolver'; import y from 'pkg'`)).toEqual([]);
    // A type alias with no semicolon must not swallow the runtime import after it.
    expect(localSpecifiers(`export type Foo = { a: number }\nimport { r } from './m'`)).toEqual([
      './m',
    ]);
    expect(
      localSpecifiers(`import type * as T from './t'; export type { A } from './u'; import './v'`)
    ).toEqual(['./v']);
  });
});
