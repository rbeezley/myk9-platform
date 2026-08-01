/**
 * Fails when a user-management component has no non-test importer.
 *
 * MYK9-134. Two components in these directories were unreachable for months:
 *
 *   - `UserDetailsDialog` (642 lines) carried 11 passing tests for a Security
 *     tab no user could open. It was the apparent home of "Send password reset
 *     email", so its existence actively misled a search for that feature.
 *   - `AccountSummaryCard` rendered a hardcoded "Active" badge that nobody saw,
 *     while the live page had its own copy of the same literal.
 *
 * Both matched the default `src/**` coverage glob, so they RAISED the coverage
 * number while being dead. "It has tests" says nothing about whether users can
 * reach it; the only reliable signal is a non-test importer.
 *
 * Scoped deliberately to the two directories where this happened rather than
 * the whole app: elsewhere there are legitimate entry points (routed pages,
 * lazy imports) that this simple check would flag wrongly. Widen it only with
 * a matching allowlist.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');

/** Directories whose components must be reachable from somewhere. */
const WATCHED_DIRS = ['components/admin/users', 'components/users/UserDetails'];

/**
 * Files that are legitimately unreferenced by other modules.
 * Add here only with a reason — every entry is a component nobody can open.
 */
const ALLOWED_ORPHANS = new Set<string>([]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith('.tsx') && !isTestModule(full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * True for anything that is test scaffolding rather than application code.
 *
 * `.test.` alone is not enough: Playwright specs are `.spec.ts(x)`, and
 * `src/test/` holds fixtures, mocks and helpers. Counting any of those as an
 * importer would let a component that ONLY tests reference pass the check —
 * the exact "reachable only from tests" shape this guard exists to catch.
 */
function isTestModule(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  return (
    p.includes('.test.') ||
    p.includes('.spec.') ||
    p.includes('/src/test/') ||
    p.includes('/__tests__/') ||
    p.includes('/__mocks__/')
  );
}

/** Every APPLICATION source file, read once. */
function sourceFiles(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const stack = [SRC];
  while (stack.length) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') stack.push(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !isTestModule(full)) {
        out.push({ path: full, text: readFileSync(full, 'utf8') });
      }
    }
  }
  return out;
}

describe('user-management components are reachable', () => {
  const all = sourceFiles();

  const components = WATCHED_DIRS.flatMap(dir => walk(join(SRC, dir)));

  it('watches a non-empty set of components', () => {
    // Guards against the check silently covering nothing if a directory moves.
    expect(components.length).toBeGreaterThan(3);
  });

  it('counts only application modules as importers', () => {
    // The guard is worthless if test scaffolding satisfies it: a component
    // referenced ONLY by a Playwright spec or a fixture under src/test is
    // exactly the "reachable only from tests" case being detected.
    expect(all.some(f => isTestModule(f.path))).toBe(false);

    for (const p of [
      '/a/b/Foo.test.tsx',
      '/a/b/Foo.spec.ts',
      '/x/src/test/utils/testUtils.tsx',
      '/x/__tests__/Foo.tsx',
      '/x/__mocks__/supabase.ts',
    ]) {
      expect(isTestModule(p), p).toBe(true);
    }
    expect(isTestModule('/x/src/components/users/UserDetailsView.tsx')).toBe(false);
  });

  it.each(components.map(path => [relative(SRC, path), path]))(
    '%s is imported by at least one non-test module',
    (rel, path) => {
      if (ALLOWED_ORPHANS.has(rel as string)) return;

      const base = (path as string)
        .replace(/\\/g, '/')
        .split('/')
        .pop()!
        .replace(/\.tsx$/, '');

      const importers = all.filter(
        f =>
          f.path !== path &&
          // Matches `from './Foo'`, `from '@/components/.../Foo'`, and lazy
          // `import('...Foo')`.
          new RegExp(`from\\s+['"][^'"]*/${base}['"]|import\\(['"][^'"]*/${base}['"]\\)`).test(
            f.text
          )
      );

      expect(
        importers.length,
        `${rel} has no non-test importer — it is unreachable in the app. Either wire it up or delete it (MYK9-134).`
      ).toBeGreaterThan(0);
    }
  );
});
