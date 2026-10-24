import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { affectedEntrypoints } from './deno-check-changed.ts';

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
      ['alpha', 'beta', 'gamma'].map(ENTRY)
    );
  });

  it('ignores deleted files and test files', () => {
    expect(
      affectedEntrypoints(root, [
        'supabase/functions/_shared/gone.ts',
        'supabase/functions/alpha/index.test.ts',
      ])
    ).toEqual([]);
  });
});
