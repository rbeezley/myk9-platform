import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { affectedEntrypoints } from './deno-check-changed.ts';

const CLI = fileURLToPath(new URL('./deno-check-changed.ts', import.meta.url));
// The fixture repository has no node_modules, so tsx is loaded by absolute URL.
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

let root: string;

function file(path: string, content = '') {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'deno-check-changed-'));
  file('supabase/functions/alpha/index.ts', "import { x } from '../_shared/x.ts';\n");
  file('supabase/functions/alpha/helper.ts');
  file(
    'supabase/functions/beta/index.ts',
    "import 'jsr:@supabase/functions-js/edge-runtime.d.ts';\nexport { y } from '../_shared/y.ts';\n"
  );
  file('supabase/functions/gamma/index.ts', "const m = await import('./lazy.ts');\n");
  file('supabase/functions/gamma/lazy.ts', "import { q } from '../../../packages/core/src/q';\n");
  // delta still imports two modules this branch deleted: one with an extension, one without.
  file(
    'supabase/functions/delta/index.ts',
    "import { d } from './deleted.ts';\nimport { e } from '../_shared/removed';\n"
  );
  file('supabase/functions/_shared/x.ts');
  file('supabase/functions/_shared/y.ts', "import { z } from './nested/z.ts';\n");
  file('supabase/functions/_shared/nested/z.ts');
  file('supabase/functions/_shared/unused.ts');
  file('packages/core/src/q.ts');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const ENTRY = (name: string) => `supabase/functions/${name}/index.ts`;

describe('affectedEntrypoints', () => {
  it.each([
    [['supabase/functions/alpha/index.ts'], ['alpha']],
    [['supabase/functions/alpha/helper.ts'], []],
    [['supabase/functions/_shared/x.ts'], ['alpha']],
    [['supabase/functions/_shared/nested/z.ts'], ['beta']],
    [['supabase/functions/_shared/unused.ts'], []],
    [['packages/core/src/q.ts'], ['gamma']],
    [['apps/myk9show/src/App.tsx', 'docs/x.md'], []],
  ])('%j affects %j', (changed, expected) => {
    expect(affectedEntrypoints(root, changed)).toEqual(expected.map(ENTRY));
  });

  it('checks every function when Deno configuration changes', () => {
    expect(affectedEntrypoints(root, ['supabase/functions/deno.json'])).toEqual(
      ['alpha', 'beta', 'delta', 'gamma'].map(ENTRY)
    );
  });

  it.each([['supabase/functions/delta/deleted.ts'], ['supabase/functions/_shared/removed.ts']])(
    'selects the consumer of a deleted import %s',
    deleted => {
      expect(affectedEntrypoints(root, [deleted])).toEqual([ENTRY('delta')]);
    }
  );

  it('selects the consumer of a renamed import through its old path', () => {
    expect(
      affectedEntrypoints(root, [
        'supabase/functions/delta/deleted.ts',
        'supabase/functions/delta/renamed.ts',
      ])
    ).toEqual([ENTRY('delta')]);
  });

  it('ignores deleted files no entrypoint imports, and test files', () => {
    expect(
      affectedEntrypoints(root, [
        'supabase/functions/_shared/gone.ts',
        'supabase/functions/alpha/index.test.ts',
      ])
    ).toEqual([]);
  });
});

/**
 * R2-03, end to end: a real Git history and a stub `deno` that fails, so the
 * test proves both that git's view of a rename reaches the selection and that
 * a failing check reaches the exit code.
 */
describe('deno-check-changed as a script', () => {
  let repo: string;
  let stubBin: string;

  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  };
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', TSX, CLI, ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${stubBin}:${process.env.PATH ?? ''}` },
    });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'deno-check-cli-'));
    stubBin = mkdtempSync(join(tmpdir(), 'deno-stub-'));
    writeFileSync(join(stubBin, 'deno'), '#!/bin/sh\necho "stub deno $*" >&2\nexit 1\n');
    chmodSync(join(stubBin, 'deno'), 0o755);
    git('init', '--quiet', '--initial-branch=main');
    git('config', 'user.email', 'fixture@example.test');
    git('config', 'user.name', 'Fixture');
    git('config', 'commit.gpgsign', 'false');
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), content);
    };
    write('supabase/functions/alpha/index.ts', "import { h } from './helper.ts';\n");
    write('supabase/functions/alpha/helper.ts', 'export const h = 1;\n');
    write('supabase/functions/beta/index.ts', 'export const b = 1;\n');
    git('add', '.');
    git('commit', '--quiet', '--no-verify', '-m', 'base');
    git('checkout', '--quiet', '-b', 'feature');
    // The rename leaves alpha importing a path that no longer exists.
    git('mv', 'supabase/functions/alpha/helper.ts', 'supabase/functions/alpha/renamed.ts');
    git('commit', '--quiet', '--no-verify', '-m', 'rename');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(stubBin, { recursive: true, force: true });
  });

  it('selects the entrypoint that still imports the old path', () => {
    const result = run('--base=main', '--list');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 affected entrypoint(s)');
    expect(result.stdout).toContain(ENTRY('alpha'));
    expect(result.stdout).not.toContain(ENTRY('beta'));
  });

  it('exits 1 when deno check fails for the selected entrypoint', () => {
    const result = run('--base=main');
    expect(result.stdout).toContain(`FAIL ${ENTRY('alpha')}`);
    expect(result.status).toBe(1);
  });
});
