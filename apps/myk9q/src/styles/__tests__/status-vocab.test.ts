import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../');
const SELF_BASENAME = 'status-vocab.test.ts';
const PATTERN = '--' + 'checkin-';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage']);

function* walk(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function countOccurrences(root: string): { total: number; files: string[] } {
  const absRoot = path.resolve(REPO_ROOT, root);
  const files: string[] = [];
  let total = 0;
  for (const file of walk(absRoot)) {
    if (path.basename(file) === SELF_BASENAME) continue;
    let contents: string;
    try {
      contents = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    if (!contents.includes(PATTERN)) continue;
    const matches = contents.split(PATTERN).length - 1;
    total += matches;
    files.push(path.relative(REPO_ROOT, file) + ':' + matches);
  }
  return { total, files };
}

describe('design-tokens.css — Phase 3 regression (--checkin-* removed)', () => {
  it('no --checkin-* references remain in apps/myk9q/src', () => {
    const { total, files } = countOccurrences('apps/myk9q/src');
    expect(files).toEqual([]);
    expect(total).toBe(0);
  });

  it('no --checkin-* references remain in apps/myk9q/public', () => {
    const { total, files } = countOccurrences('apps/myk9q/public');
    expect(files).toEqual([]);
    expect(total).toBe(0);
  });

  it('no --checkin-* references remain in packages/core/src', () => {
    const { total, files } = countOccurrences('packages/core/src');
    expect(files).toEqual([]);
    expect(total).toBe(0);
  });

  it('design-tokens.css does not define any --checkin-* aliases', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).not.toMatch(/--checkin-[a-z-]+\s*:/);
  });

  it('canonical --status-* namespace still exists (smoke)', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../design-tokens.css'), 'utf-8');
    expect(css).toMatch(/--status-checked-in:/);
    expect(css).toMatch(/--status-pulled:/);
    expect(css).toMatch(/--status-in-ring:/);
    expect(css).toMatch(/--status-completed:/);
  });
});
