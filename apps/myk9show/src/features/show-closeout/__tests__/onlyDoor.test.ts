import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

// A show write that names the completed status: `updateShow(id, { status: 'completed' })`.
const SHOW_COMPLETED_WRITE = /update(?:Show|Shows)\w*\([^;]*?status:\s*['"]completed['"]/gs;

describe('no path sets a show to completed except the close step (MYK9-1945)', () => {
  it('only CloseOutShowAction writes status completed to a show', () => {
    const writers = sourceFiles(SRC)
      .filter(file => {
        SHOW_COMPLETED_WRITE.lastIndex = 0;
        return SHOW_COMPLETED_WRITE.test(readFileSync(file, 'utf8'));
      })
      .map(file => relative(SRC, file));

    expect(writers).toEqual(['features/show-workbench/CloseOutShowAction.tsx']);
  });
});
