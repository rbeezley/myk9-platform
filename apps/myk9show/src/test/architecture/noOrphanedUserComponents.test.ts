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
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Every non-test source file, read once. */
function sourceFiles(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const stack = [SRC];
  while (stack.length) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') stack.push(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.')) {
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
