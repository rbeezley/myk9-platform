import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FUNCTION_DIRS } from './edge-function-drift.ts';
import {
  allOutOfTreeImports,
  outOfTreeImports,
  relativeSpecifiers,
} from './edge-function-imports.ts';

/**
 * MYK9-729: cron-health-check imported its cadence constants from app `src/`,
 * so `supabase functions download` refused its bundle and the content drift
 * check could never compare it. The cadence module now lives in `_shared`;
 * these tests keep every function's import graph inside the tree it deploys
 * from, and prove the walker finds an escape before its green is trusted.
 */

describe('relativeSpecifiers', () => {
  it('reads every import form, and only relative ones', () => {
    const text = [
      "import { a } from './a.ts';",
      "import type { B } from '../_shared/b.ts';",
      "import './side-effect.ts';",
      "const c = await import('../c.ts');",
      "export * from './d.ts';",
      "export { e } from './e.ts';",
      "import { createClient } from 'npm:@supabase/supabase-js@2';",
      "import 'jsr:@supabase/functions-js/edge-runtime.d.ts';",
      "// import { gone } from '../../../src/commented-out.ts';",
      " * import { alsoGone } from '../../../src/in-a-doc-comment.ts';",
      'import {',
      '  f,',
      "} from './f.ts';",
    ].join('\n');
    expect(relativeSpecifiers(text)).toEqual([
      './a.ts',
      '../_shared/b.ts',
      './side-effect.ts',
      '../c.ts',
      './d.ts',
      './e.ts',
      './f.ts',
    ]);
  });
});

describe('outOfTreeImports, on a fixture tree', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(files: Record<string, string>): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'edge imports ')));
    dirs.push(root);
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return root;
  }

  it('finds an app import reached only through a _shared file (positive control)', () => {
    const root = repo({
      'apps/app/supabase/functions/fn/index.ts': "import { h } from '../_shared/h.ts';\n",
      'apps/app/supabase/functions/_shared/h.ts':
        "export { cadence } from '../../../src/features/cadence.ts';\n",
      'apps/app/src/features/cadence.ts': 'export const cadence = 1;\n',
    });
    expect(outOfTreeImports(root, 'apps/app/supabase/functions', 'fn')).toEqual([
      {
        importer: 'apps/app/supabase/functions/_shared/h.ts',
        specifier: '../../../src/features/cadence.ts',
        resolved: 'apps/app/src/features/cadence.ts',
      },
    ]);
  });

  it('reports nothing for a function that stays in its tree, and follows import cycles once', () => {
    const root = repo({
      'supabase/functions/fn/index.ts': "import { a } from '../_shared/a.ts';\n",
      'supabase/functions/_shared/a.ts': "import { b } from './b';\nexport const a = 1;\n",
      'supabase/functions/_shared/b.ts': "import { a } from './a.ts';\nexport const b = a;\n",
    });
    expect(outOfTreeImports(root, 'supabase/functions', 'fn')).toEqual([]);
  });

  it('a sibling tree sharing a name prefix is still outside', () => {
    const root = repo({
      'supabase/functions/fn/index.ts': "import '../../functions-extra/x.ts';\n",
      'supabase/functions-extra/x.ts': '',
    });
    expect(outOfTreeImports(root, 'supabase/functions', 'fn').map(e => e.resolved)).toEqual([
      'supabase/functions-extra/x.ts',
    ]);
  });
});

describe('the real repo', () => {
  const root = resolve(import.meta.dirname, '../..');

  it('the walk reaches cron-health-check and its cadence import (the scan is not vacuous)', () => {
    const entry = join(root, 'apps/myk9show/supabase/functions/cron-health-check/index.ts');
    expect(relativeSpecifiers(readFileSync(entry, 'utf8'))).toContain(
      '../_shared/healthCheckCadence.ts'
    );
    expect(outOfTreeImports(root, 'apps/myk9show/supabase/functions', 'cron-health-check')).toEqual(
      []
    );
  });

  it('no edge function imports a file outside the tree it deploys from', () => {
    expect(allOutOfTreeImports(root, FUNCTION_DIRS)).toEqual([]);
  });
});
