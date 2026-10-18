// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The step-up rule (MYK9-1208) is needed by functions in both edge-function trees. Each
// tree deploys on its own, so each carries a copy; this keeps the two copies one rule.
describe('stepUpReauth copies', () => {
  it('the root-tree copy is byte-identical to the myk9show-tree copy', () => {
    const here = fileURLToPath(new URL('./stepUpReauth.ts', import.meta.url));
    const app = fileURLToPath(
      new URL('../../../apps/myk9show/supabase/functions/_shared/stepUpReauth.ts', import.meta.url)
    );
    expect(readFileSync(here, 'utf8')).toBe(readFileSync(app, 'utf8'));
  });
});
