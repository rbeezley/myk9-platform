import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);
const INVALID_TOKEN_WRAPPER = /hsla?\(\s*var\(/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

describe('theme color token syntax', () => {
  it('does not wrap hex-backed color tokens in hsl()', () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter(path => INVALID_TOKEN_WRAPPER.test(readFileSync(path, 'utf8')))
      .map(path => relative(SOURCE_ROOT, path));

    expect(offenders).toEqual([]);
  });
});
