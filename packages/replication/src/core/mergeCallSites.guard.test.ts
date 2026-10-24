// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-1378: `mergeNonConflictingServerFields` only honors the table compare
 * policy (`fieldGroups`) when it is handed one. A second call site would be
 * free to omit it, so the call lives in exactly one place: the
 * `ReplicatedTable.mergeServerFields` wrapper.
 */
const REPO_ROOT = resolve(__dirname, '../../../..');
const ROOTS = ['packages/replication/src', 'apps/myk9show/src'];
const WRAPPER = 'packages/replication/src/core/ReplicatedTable.ts';
const CALL = /(?<!function\s+)\bmergeNonConflictingServerFields\s*(?:<[^>(]*>)?\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const isSource = /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name);
    return isSource ? [path] : [];
  });
}

describe('mergeNonConflictingServerFields call sites (MYK9-1378)', () => {
  it('is called from exactly one place: the ReplicatedTable.mergeServerFields wrapper', () => {
    const calls = ROOTS.flatMap(root =>
      sourceFiles(join(REPO_ROOT, root)).flatMap(file => {
        const text = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/^import[\s\S]*?;$/gm, '');
        const count = text.match(CALL)?.length ?? 0;
        return Array.from({ length: count }, () => relative(REPO_ROOT, file));
      })
    );

    expect(
      calls,
      'Route new merge sites through ReplicatedTable.mergeServerFields so the table compare policy (fieldGroups) always applies.'
    ).toEqual([WRAPPER]);
  });
});
