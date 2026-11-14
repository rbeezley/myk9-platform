import { win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { relativePosix, toPosixPath } from './posixPath';

describe('posixPath', () => {
  it('leaves a POSIX-style path unchanged', () => {
    expect(toPosixPath('assets/scripts/chunk.js')).toBe('assets/scripts/chunk.js');
    expect(relativePosix('/a/b', '/a/b/c/d.ts')).toBe('c/d.ts');
  });

  it('turns a Windows-style relative path into forward slashes on Windows only', () => {
    const windowsRelative = win32.relative('C:\\repo\\src', 'C:\\repo\\src\\test\\ci\\a.ts');
    expect(windowsRelative).toBe('test\\ci\\a.ts');
    // On POSIX a backslash is a legal filename character, so the helper leaves it alone.
    const expected = process.platform === 'win32' ? 'test/ci/a.ts' : windowsRelative;
    expect(toPosixPath(windowsRelative)).toBe(expected);
  });

  it('a differing path still differs after normalising (the comparison is not loosened)', () => {
    expect(toPosixPath('src\\a.ts')).not.toBe(toPosixPath('src\\b.ts'));
    expect(relativePosix('/a', '/a/x.ts')).not.toBe(relativePosix('/a', '/a/y.ts'));
  });
});
