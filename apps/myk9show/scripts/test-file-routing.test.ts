import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function findFiles(root: string, suffix: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return findFiles(path, suffix);
    }
    return entry.name.endsWith(suffix) ? [path] : [];
  });
}

describe('test-file routing', () => {
  it('keeps jsdom UI integration tests in the normal CI suite', () => {
    const sourceRoot = resolve(import.meta.dirname, '../src');
    const misroutedTests = findFiles(sourceRoot, '.integration.test.tsx').map(path =>
      relative(sourceRoot, path)
    );

    expect(
      misroutedTests,
      'TSX integration tests need jsdom and must use the normal .test.tsx suffix'
    ).toEqual([]);
  });
});
