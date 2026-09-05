import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findStalePackages, findWorkspaceRoot } from './check-dist-fresh';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'dist-fresh-'));
  dirs.push(root);
  mkdirSync(join(root, 'packages'));
  return root;
}
function pkg(
  root: string,
  name: string,
  opts: { main?: string; dist?: boolean; srcAge: number; distAge?: number }
) {
  const dir = join(root, 'packages', name);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name, main: opts.main ?? './dist/index.js' })
  );
  const src = join(dir, 'src', 'index.ts');
  writeFileSync(src, 'export const x = 1;');
  const now = Date.now() / 1000;
  utimesSync(src, now - opts.srcAge, now - opts.srcAge);
  if (opts.dist) {
    mkdirSync(join(dir, 'dist'));
    const out = join(dir, 'dist', 'index.js');
    writeFileSync(out, 'export const x = 1;');
    utimesSync(out, now - (opts.distAge ?? 0), now - (opts.distAge ?? 0));
  }
}

describe('findWorkspaceRoot', () => {
  it('walks up from a package directory to the pnpm workspace root', () => {
    // The app's `test` script runs this from apps/myk9show; the first version
    // looked for packages/ relative to cwd and crashed there.
    const root = repo();
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    mkdirSync(join(root, 'apps', 'show', 'src'), { recursive: true });
    expect(findWorkspaceRoot(join(root, 'apps', 'show', 'src'))).toBe(root);
  });

  it('throws when no workspace root exists above the start', () => {
    const root = repo();
    expect(() => findWorkspaceRoot(root)).toThrow(/no pnpm-workspace.yaml/);
  });
});

describe('findStalePackages', () => {
  it('passes when dist is newer than every src file', () => {
    const root = repo();
    pkg(root, 'fresh', { dist: true, srcAge: 100, distAge: 10 });
    expect(findStalePackages(root)).toEqual([]);
  });

  it('flags a package whose src was edited after the last build', () => {
    const root = repo();
    pkg(root, 'edited', { dist: true, srcAge: 10, distAge: 100 });
    const stale = findStalePackages(root);
    expect(stale.map(s => s.name)).toEqual(['edited']);
    expect(stale[0].reason).toMatch(/src\/ is newer/);
  });

  it('flags a package that was never built', () => {
    const root = repo();
    pkg(root, 'unbuilt', { dist: false, srcAge: 10 });
    expect(findStalePackages(root)[0]).toMatchObject({ name: 'unbuilt' });
    expect(findStalePackages(root)[0].reason).toMatch(/never built/);
  });

  it('skips packages consumed from src (no build step)', () => {
    const root = repo();
    pkg(root, 'test-utils', { main: './src/index.ts', dist: false, srcAge: 10 });
    expect(findStalePackages(root)).toEqual([]);
  });

  it('restricts to the named packages when a list is given', () => {
    const root = repo();
    pkg(root, 'a', { dist: true, srcAge: 10, distAge: 100 });
    pkg(root, 'b', { dist: true, srcAge: 10, distAge: 100 });
    expect(findStalePackages(root, ['b']).map(s => s.name)).toEqual(['b']);
  });
});
